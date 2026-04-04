import { readTenders, readSearches, readAiScores, upsertSearch, deleteSearch as storeDeleteSearch, setSearchEnabled as storeSetSearchEnabled, AiScoreCache, getPipelineEntry, getPipelineCounts, readPipeline, readCronRun } from "@/lib/store";
import { buildPipelineFeedbackMap } from "@/lib/pipeline-learning";
import { countByOpportunityCategory, getOpportunityCategory } from "@/lib/opportunity-category";
import { findKeywordMatch } from "@/lib/keywords";
import { scoreTender, scoreTenderForSME } from "@/lib/scoring";
import { SavedSearch, SearchMatch, Tender, TenderLifecycleStatus } from "@/lib/types";
import { isOnOrAfter } from "@/lib/time-window";

const DEFAULT_PAGE_SIZE = 25;
export type TenderView = "active" | "archived" | "all";
type GetDashboardDataOptions = {
  publishedSince?: string | null;
};

function getSmeScoreMap(tenders: Tender[]) {
  return new Map(tenders.map((tender) => [tender.id, scoreTenderForSME(tender).score]));
}

function getEnabledSearches(searches: SavedSearch[]) {
  return searches.filter((search) => search.enabled);
}

function filterTendersByView(tenders: Tender[], view: TenderView) {
  if (view === "all") return tenders;
  return tenders.filter((tender) => tender.lifecycleStatus === view);
}

function countByLifecycle(tenders: Tender[]) {
  return tenders.reduce<Record<TenderLifecycleStatus, number>>(
    (counts, tender) => {
      counts[tender.lifecycleStatus] = (counts[tender.lifecycleStatus] ?? 0) + 1;
      return counts;
    },
    { active: 0, archived: 0 },
  );
}

function getRecurringTenderSignals(tenders: Tender[]) {
  const familyCounts = new Map<string, number>();
  for (const tender of tenders) {
    const familyKey = `${tender.buyerName.toLowerCase()}|${[...tender.cpvCodes].sort().slice(0, 2).join(",")}`;
    familyCounts.set(familyKey, (familyCounts.get(familyKey) ?? 0) + 1);
  }
  return familyCounts;
}

function getBuyerHistory(tender: Tender, tenders: Tender[]) {
  const relatedArchived = tenders
    .filter(
      (candidate) =>
        candidate.id !== tender.id &&
        candidate.lifecycleStatus === "archived" &&
        candidate.buyerName === tender.buyerName,
    )
    .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());

  const sharedCpvHistory = relatedArchived.filter((candidate) =>
    candidate.cpvCodes.some((cpv) => tender.cpvCodes.includes(cpv)),
  );

  return {
    archivedCount: relatedArchived.length,
    sharedCpvCount: sharedCpvHistory.length,
    recentArchived: relatedArchived.slice(0, 3),
  };
}

function buildMatches(
  searches: SavedSearch[],
  tenders: Tender[],
  aiCache: AiScoreCache = {},
  feedbackByTender = new Map<string, { scoreDelta: number; reasons: string[] }>(),
): SearchMatch[] {
  return searches
    .flatMap((search) =>
      tenders.flatMap((tender) => {
        const result = scoreTender(search, tender, {
          feedback: feedbackByTender.get(tender.id),
        });
        if (!result.isMatch) return [];
        const cacheKey = `${search.id}:${tender.sourceNoticeId}:${result.scope.id}`;
        const legacyKey = `${search.id}:${tender.sourceNoticeId}`;
        const aiEntry = aiCache[cacheKey] ?? aiCache[legacyKey];
        return [
          {
            searchId: search.id,
            searchName: search.name,
            tenderId: tender.id,
            sourceNoticeId: tender.sourceNoticeId,
            source: tender.source,
            title: tender.title,
            buyerName: tender.buyerName,
            country: tender.country,
            currency: tender.currency,
            estimatedValue: tender.estimatedValue,
            publishedAt: tender.publishedAt,
            deadlineAt: tender.deadlineAt,
            opportunityCategory: getOpportunityCategory(tender),
            score: result.score,
            baseScore: result.baseScore,
            matchReasons: result.reasons,
            matchedScope: result.scope,
            feedbackDelta: result.feedbackDelta,
            feedbackReasons: result.feedbackReasons,
            aiScore: aiEntry?.score,
            aiReasoning: aiEntry?.reasoning,
          } satisfies SearchMatch,
        ];
      })
    )
    .sort((a, b) => {
      // Keep deterministic SME-aware scoring in control; AI only nudges the ordering.
      const aSort = a.aiScore !== undefined ? a.score * 0.7 + a.aiScore * 0.3 : a.score;
      const bSort = b.aiScore !== undefined ? b.score * 0.7 + b.aiScore * 0.3 : b.score;
      return bSort - aSort;
    });
}

function sortTenders(
  tenders: Tender[],
  sort?: string,
  dir?: string,
  smeScores: Map<string, number> = new Map(),
): Tender[] {
  if (!sort) return tenders;
  const asc = dir === "asc";
  return [...tenders].sort((a, b) => {
    switch (sort) {
      case "sme": {
        const diff = (smeScores.get(a.id) ?? 0) - (smeScores.get(b.id) ?? 0);
        return asc ? diff : -diff;
      }
      case "deadline": {
        if (!a.deadlineAt && !b.deadlineAt) return 0;
        if (!a.deadlineAt) return 1;
        if (!b.deadlineAt) return -1;
        const diff = new Date(a.deadlineAt).getTime() - new Date(b.deadlineAt).getTime();
        return asc ? diff : -diff;
      }
      case "value": {
        if (a.estimatedValue === null && b.estimatedValue === null) return 0;
        if (a.estimatedValue === null) return 1;
        if (b.estimatedValue === null) return -1;
        return asc
          ? a.estimatedValue - b.estimatedValue
          : b.estimatedValue - a.estimatedValue;
      }
      case "published": {
        const diff = new Date(a.publishedAt).getTime() - new Date(b.publishedAt).getTime();
        return asc ? diff : -diff;
      }
      default:
        return 0;
    }
  });
}

function sortMatches(matches: SearchMatch[], sort?: string, dir?: string): SearchMatch[] {
  if (!sort) return matches;
  const asc = dir === "asc";
  return [...matches].sort((a, b) => {
    switch (sort) {
      case "score": {
        const aS = a.aiScore !== undefined ? a.score * 0.7 + a.aiScore * 0.3 : a.score;
        const bS = b.aiScore !== undefined ? b.score * 0.7 + b.aiScore * 0.3 : b.score;
        return asc ? aS - bS : bS - aS;
      }
      case "deadline": {
        if (!a.deadlineAt && !b.deadlineAt) return 0;
        if (!a.deadlineAt) return 1;
        if (!b.deadlineAt) return -1;
        const diff = new Date(a.deadlineAt).getTime() - new Date(b.deadlineAt).getTime();
        return asc ? diff : -diff;
      }
      case "value": {
        if (a.estimatedValue === null && b.estimatedValue === null) return 0;
        if (a.estimatedValue === null) return 1;
        if (b.estimatedValue === null) return -1;
        return asc
          ? a.estimatedValue - b.estimatedValue
          : b.estimatedValue - a.estimatedValue;
      }
      case "published": {
        const diff = new Date(a.publishedAt).getTime() - new Date(b.publishedAt).getTime();
        return asc ? diff : -diff;
      }
      default:
        return 0;
    }
  });
}

export async function getDashboardSnapshot() {
  const searches = await readSearches();
  const enabledSearches = getEnabledSearches(searches);
  const tenders = await readTenders();
  const activeTenders = filterTendersByView(tenders, "active");
  const feedbackByTender = buildPipelineFeedbackMap(tenders, await readPipeline());
  const matches = buildMatches(enabledSearches, activeTenders, {}, feedbackByTender);
  const lifecycleCounts = countByLifecycle(tenders);

  return {
    totalTenders: tenders.length,
    activeTenders: lifecycleCounts.active,
    archivedTenders: lifecycleCounts.archived,
    totalSearches: enabledSearches.length,
    totalProfiles: searches.length,
    strongMatches: matches.filter((match) => match.score >= 70).length,
    pipeline: await getPipelineCounts(),
    lastRun: await readCronRun(),
  };
}

// Common words to exclude from keyword frequency analysis
const STOP_WORDS = new Set([
  // English
  "the","and","for","with","of","to","in","a","an","on","at","by","from",
  "this","that","these","those","is","are","was","were","be","been","being",
  "have","has","had","do","does","did","will","would","could","should","may",
  "might","shall","can","not","or","but","if","as","its","it","we","our",
  "you","your","they","their","them","all","any","both","each","few","more",
  "most","other","some","such","no","nor","so","yet","both","whether","into",
  "through","during","before","after","above","below","between","out","off",
  "over","under","again","further","then","once","here","there","when","where",
  "which","who","whom","how","provision","contract","service","services",
  "tender","lot","framework","agreement","supply","provision","public",
  "management","system","systems","support","national","authority","council",
  "government","local","central","authority","authorities","procurement",
  "open","restricted","procedure","notice","call","reference","number",
  "including","related","based","required","provide","delivery","work","works",
  "project","projects","new","use","used","using","within","across","various",
  // French
  "de","des","du","les","le","la","et","en","un","une","pour","dans","sur",
  "par","avec","au","aux","ce","qui","que","ou","mais","donc","car","ni",
  "se","sa","son","ses","leur","leurs","est","sont","sera","seront","été",
  "avoir","faire","plus","lors","afin","selon","sans","sous","lors","entre",
  "marché","marchés","prestations","fourniture","accord","cadre","avis",
  "mise","gestion","système","systèmes","national","publique","ville",
  "collectivité","département","région","commune","communauté",
  // German
  "die","der","das","und","für","mit","von","des","dem","den","ein","eine",
  "einer","eines","einem","einen","nicht","oder","auch","sind","wird","werden",
  "haben","sein","dass","nach","bei","alle","wenn","kann","mehr","über","noch",
  "dann","durch","aber","wird","wurde","wurden","ihrer","seine","einer",
  "lieferung","leistung","leistungen","rahmen","vertrag","öffentlich","vergabe",
  // Spanish
  "de","la","el","los","las","del","con","para","por","una","uno","que","como",
  "más","también","pero","entre","sobre","todo","esta","este","estos","estas",
  "ser","está","están","tiene","tienen","hacer","sido","sus","cual","cuales",
  "contrato","servicios","licitación","adjudicación","nacional","público","pública",
  // Italian
  "di","il","la","le","gli","del","dei","delle","della","dell","con","per",
  "che","come","anche","sono","non","una","uno","dei","alla","alle","agli",
  "questo","questa","questi","queste","essere","servizi","contratto","appalto",
  "fornitura","pubblica","nazionale","gestione",
  // Portuguese
  "de","da","do","das","dos","para","com","por","que","como","uma","não",
  "mais","também","mas","entre","sobre","esta","este","estes","estas",
  "serviços","contrato","fornecimento","público","pública","nacional","gestão",
  // Dutch
  "de","het","een","van","voor","met","niet","zijn","heeft","worden","door",
  "maar","ook","naar","over","meer","deze","deze","worden","levering","diensten",
  "opdracht","overeenkomst","nationaal","openbaar","aanbesteding",
  // Polish
  "dla","się","jest","nie","oraz","jako","tego","przez","przy","jego","jej",
  "być","będzie","które","który","która","usługi","zamówienie","dostawa",
  "publiczne","krajowe","zarządzanie",
]);

function getTopKeywords(tenders: Tender[], limit = 40): { word: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const t of tenders) {
    const text = `${t.title} ${t.description ?? ""}`;
    const words = text
      .toLowerCase()
      .split(/[\s\-\/,;:()[\]{}«»"'|.]+/)
      .filter((w) => w.length >= 4 && !STOP_WORDS.has(w) && /^[a-zàâäáãåæçéèêëíîïñóôöõøùúûüýþß]+$/.test(w));
    for (const w of words) {
      counts.set(w, (counts.get(w) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([word, count]) => ({ word, count }));
}

function countBySource(tenders: Tender[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const t of tenders) {
    const src = t.source || "unknown";
    counts[src] = (counts[src] ?? 0) + 1;
  }
  return counts;
}

function getCountryList(tenders: Tender[]): { country: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const t of tenders) {
    const c = t.country || "Unknown";
    counts.set(c, (counts.get(c) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([country, count]) => ({ country, count }));
}

export async function getDashboardData(
  page: number = 1,
  pageSize: number = DEFAULT_PAGE_SIZE,
  countries: string[] = [],
  keyword?: string,
  buyer?: string,
  view: TenderView = "active",
  sort?: string,
  dir?: string,
  options: GetDashboardDataOptions = {},
) {
  const searches = await readSearches();
  const enabledSearches = getEnabledSearches(searches);
  const allTenders = await readTenders();
  const tendersForView = filterTendersByView(allTenders, view);
  const allCountries = getCountryList(tendersForView);
  const aiCache = await readAiScores();
  const pipelineCounts = await getPipelineCounts();
  const feedbackByTender = buildPipelineFeedbackMap(allTenders, await readPipeline());
  const lifecycleCounts = countByLifecycle(allTenders);
  const recurringFamilies = getRecurringTenderSignals(allTenders);
  const lastRun = await readCronRun();

  let tenders = countries.length > 0
    ? tendersForView.filter((t) => countries.includes(t.country))
    : tendersForView;

  if (keyword) {
    tenders = tenders.filter(
      (t) =>
        Boolean(findKeywordMatch(t.title, keyword)) ||
        Boolean(findKeywordMatch(t.description ?? "", keyword)),
    );
  }

  if (buyer) {
    tenders = tenders.filter((tender) => tender.buyerName === buyer);
  }

  if (options.publishedSince) {
    tenders = tenders.filter((tender) => isOnOrAfter(tender.publishedAt, options.publishedSince));
  }

  const allMatches = buildMatches(enabledSearches, tenders, aiCache, feedbackByTender);
  const bySource = countBySource(tenders);
  const byCategory = countByOpportunityCategory(tenders);
  const topKeywords = getTopKeywords(tenders);
  const smeScores = getSmeScoreMap(tenders);

  // When browsing by country or keyword, show paginated all-tenders list
  if (enabledSearches.length === 0 || countries.length > 0 || keyword || buyer) {
    const defaultSort = enabledSearches.length === 0 ? "sme" : "published";
    const sorted = sortTenders(tenders, sort || defaultSort, dir || "desc", smeScores);
    const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
    const safePage = Math.min(Math.max(1, page), totalPages);
    const start = (safePage - 1) * pageSize;
    const pageTenders = sorted.slice(start, start + pageSize);

    return {
      snapshot: {
        totalTenders: tenders.length,
        activeTenders: lifecycleCounts.active,
        archivedTenders: lifecycleCounts.archived,
        strongMatches: allMatches.filter((m) => m.score >= 70).length,
        bySource,
        byCategory,
        pipeline: pipelineCounts,
        lastRun,
      },
      allCountries,
      topKeywords,
      searches,
      activeSearchCount: enabledSearches.length,
      view,
      recurringFamilies: [...recurringFamilies.values()].filter((count) => count > 1).length,
      matches: [],
      allTenders: pageTenders,
      smeScores: Object.fromEntries(smeScores),
      pagination: { page: safePage, pageSize, totalPages, totalItems: tenders.length },
      sort: sort || defaultSort,
      dir: dir || "desc",
    };
  }

  const sorted = sortMatches(allMatches, sort || "score", dir || "desc");
  const matches = sorted.slice(0, 20);

  return {
    snapshot: {
      totalTenders: tenders.length,
      activeTenders: lifecycleCounts.active,
      archivedTenders: lifecycleCounts.archived,
      strongMatches: allMatches.filter((match) => match.score >= 70).length,
      bySource,
      byCategory,
      pipeline: pipelineCounts,
      lastRun,
    },
    allCountries,
    topKeywords,
    searches,
    activeSearchCount: enabledSearches.length,
    view,
    recurringFamilies: [...recurringFamilies.values()].filter((count) => count > 1).length,
    matches,
    allTenders: undefined,
    smeScores: Object.fromEntries(smeScores),
    pagination: undefined,
    sort: sort || "score",
    dir: dir || "desc",
  };
}

export async function getTenderDetail(id: string) {
  const searches = await readSearches();
  const enabledSearches = getEnabledSearches(searches);
  const tenders = await readTenders();
  const aiCache = await readAiScores();
  const feedbackByTender = buildPipelineFeedbackMap(tenders, await readPipeline());
  const tender = tenders.find((item) => item.id === id);
  if (!tender) return null;

  const pipeline = await getPipelineEntry(tender.id);
  const tenderFeedback = feedbackByTender.get(tender.id) ?? { scoreDelta: 0, reasons: [] };

  const matches = enabledSearches.flatMap((search) => {
    const result = scoreTender(search, tender, { feedback: tenderFeedback });
    if (!result.isMatch) return [];
    const cacheKey = `${search.id}:${tender.sourceNoticeId}:${result.scope.id}`;
    const legacyKey = `${search.id}:${tender.sourceNoticeId}`;
    const aiEntry = aiCache[cacheKey] ?? aiCache[legacyKey];
    return [{
      searchId: search.id,
      searchName: search.name,
      score: result.score,
      baseScore: result.baseScore,
      matchReasons: result.reasons,
      matchedScope: result.scope,
      feedbackDelta: result.feedbackDelta,
      feedbackReasons: result.feedbackReasons,
      aiScore: aiEntry?.score,
      aiReasoning: aiEntry?.reasoning,
    }];
  }).sort((a, b) => {
    const aSort = a.aiScore !== undefined ? a.score * 0.7 + a.aiScore * 0.3 : a.score;
    const bSort = b.aiScore !== undefined ? b.score * 0.7 + b.aiScore * 0.3 : b.score;
    return bSort - aSort;
  });

  return {
    ...tender,
    matches,
    pipeline,
    feedback: tenderFeedback,
    buyerHistory: getBuyerHistory(tender, tenders),
  };
}

export async function upsertSavedSearch(input: Omit<SavedSearch, "id">) {
  await upsertSearch(input);
}

export async function deleteSavedSearch(id: string) {
  await storeDeleteSearch(id);
}

export async function setSavedSearchEnabled(id: string, enabled: boolean) {
  await storeSetSearchEnabled(id, enabled);
}
