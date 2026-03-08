import { IT_CONSULTANCY_CPV_CODES } from "@/lib/cpv";
import {
  findKeywordMatch,
  findKeywordMatchInNormalizedText,
  normalizeKeywordText,
} from "@/lib/keywords";
import { extractTenderScopes } from "@/lib/lots";
import { PipelineFeedback, SavedSearch, Tender, TenderScope } from "@/lib/types";

const SME_SOFTWARE_KEYWORDS = [
  "software",
  "application",
  "applications",
  "development",
  "développement",
  "developer",
  "integration",
  "intégration",
  "api",
  "platform",
  "plateforme",
  "maintenance évolutive",
  "maintenance",
  "devops",
  "engineering",
  "java",
  "react",
  "cloud-native",
];

const SME_CLOUD_KEYWORDS = [
  "cloud",
  "migration",
  "review",
  "assessment",
  "audit",
  "landing zone",
  "modernisation",
  "modernization",
  "application support",
  "support applicatif",
  "maintenance applicative",
  "knowledge transfer",
  "finops",
  "architecture review",
];

const SME_ADVISORY_KEYWORDS = [
  "expert",
  "senior expert",
  "architect",
  "consultant",
  "advisory",
  "advisory services",
  "technical assistance",
  "assistance technique",
  "amo",
  "assistance à maîtrise d'ouvrage",
  "strategy",
  "roadmap",
  "review",
  "specialist",
  "consultancy",
];

const SME_FRAMEWORK_KEYWORDS = [
  "framework",
  "framework agreement",
  "accord-cadre",
  "lot",
  "lots",
  "call-off",
  "mini competition",
  "dynamic purchasing",
  "dps",
  "panel",
  "subcontract",
  "subcontracting",
  "sous-traitance",
  "consortium",
];

const SME_OPERATIONAL_PENALTIES = [
  "24/7",
  "24x7",
  "service desk",
  "help desk",
  "helpdesk",
  "call centre",
  "call center",
  "noc",
  "soc",
  "round-the-clock",
  "run service",
  "run services",
  "managed services",
  "multi-disciplinary",
  "multidisciplinary",
  "service transition",
  "incident response",
  "l1",
  "l2",
  "l3",
  "outsourcing",
  "on-site team",
  "continuous operations",
];

const SME_COUNTRIES = new Set(["France", "Belgium", "Luxembourg", "Ireland"]);

function containsKeyword(text: string, keyword: string) {
  return Boolean(findKeywordMatchInNormalizedText(text, keyword));
}

function countKeywordMatches(text: string, keywords: string[]) {
  return keywords.filter((keyword) => containsKeyword(text, keyword));
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function daysUntil(dateIso: string | null) {
  if (!dateIso) return null;
  const ms = new Date(dateIso).getTime() - Date.now();
  return Math.floor(ms / (1000 * 60 * 60 * 24));
}

function preferCandidateScope(
  currentBest: { score: number; rawScore?: number; scope: TenderScope },
  candidate: { score: number; rawScore?: number; scope: TenderScope },
) {
  const candidateScore = candidate.rawScore ?? candidate.score;
  const currentScore = currentBest.rawScore ?? currentBest.score;

  if (candidateScore > currentScore) {
    return true;
  }

  if (
    candidate.scope.kind === "lot" &&
    currentBest.scope.kind === "notice" &&
    candidateScore >= currentScore - 4
  ) {
    return true;
  }

  return false;
}

function scoreSmeScope(tender: Tender, scope: TenderScope) {
  const scoreReasons: string[] = [];
  const text = `${scope.title} ${scope.description}`.toLowerCase();
  let score = 35;

  const cpvOverlap = tender.cpvCodes.filter((cpv) => IT_CONSULTANCY_CPV_CODES.includes(cpv));
  if (cpvOverlap.length > 0) {
    score += 18;
    scoreReasons.push(`Consultancy CPV overlap (${cpvOverlap.join(", ")}).`);
  }

  const softwareHits = countKeywordMatches(text, SME_SOFTWARE_KEYWORDS);
  if (softwareHits.length > 0) {
    score += 18 + Math.min(6, (softwareHits.length - 1) * 2);
    scoreReasons.push("Software development or integration scope is explicit.");
  }

  const cloudHits = countKeywordMatches(text, SME_CLOUD_KEYWORDS);
  if (cloudHits.length > 0) {
    score += 14 + Math.min(4, cloudHits.length - 1);
    scoreReasons.push("Cloud review, migration, or bounded application support work is present.");
  }

  const advisoryHits = countKeywordMatches(text, SME_ADVISORY_KEYWORDS);
  if (advisoryHits.length > 0) {
    score += 16 + Math.min(4, advisoryHits.length - 1);
    scoreReasons.push("Reads like senior expert or advisory work rather than a large delivery factory.");
  }

  const frameworkHits = countKeywordMatches(text, SME_FRAMEWORK_KEYWORDS);
  if (frameworkHits.length > 0 && SME_COUNTRIES.has(tender.country)) {
    score += 14;
    scoreReasons.push(`Framework or subcontract-style wording in ${tender.country}.`);
  } else if (frameworkHits.length > 0) {
    score += 6;
    scoreReasons.push("Lot or framework wording could allow targeted SME participation.");
  }

  if (tender.estimatedValue !== null) {
    if (tender.estimatedValue >= 40000 && tender.estimatedValue <= 350000) {
      score += 16;
      scoreReasons.push("Budget sits in a typical SME-friendly range.");
    } else if (tender.estimatedValue > 350000 && tender.estimatedValue <= 900000) {
      score += 8;
      scoreReasons.push("Budget is still plausible for a small specialist team or subcontracting role.");
    } else if (tender.estimatedValue > 900000 && tender.estimatedValue <= 2000000) {
      score -= 6;
      scoreReasons.push("Budget suggests a larger contract than a typical small prime bid.");
    } else if (tender.estimatedValue > 2000000) {
      score -= 18;
      scoreReasons.push("Budget is likely too large for an SME-led prime unless it is a small lot.");
    } else if (tender.estimatedValue < 20000) {
      score -= 4;
      scoreReasons.push("Budget may be too small to be commercially attractive.");
    }
  } else {
    score += 3;
    scoreReasons.push("Undisclosed budget keeps the opportunity open for SME review.");
  }

  if (advisoryHits.length > 0 && tender.estimatedValue !== null && tender.estimatedValue <= 160000) {
    score += 8;
    scoreReasons.push("Advisory scope and budget could realistically map to one senior expert.");
  }

  const operationalHits = countKeywordMatches(text, SME_OPERATIONAL_PENALTIES);
  if (operationalHits.length > 0) {
    score -= 18 + Math.min(10, (operationalHits.length - 1) * 2);
    scoreReasons.push("Operational burden looks broad for a small consultancy.");
  }

  if (cpvOverlap.length === 0 && softwareHits.length === 0 && cloudHits.length === 0 && advisoryHits.length === 0) {
    score -= 12;
    scoreReasons.push("Little evidence that this sits in software consultancy territory.");
  }

  return {
    score: clamp(score, 0, 100),
    rawScore: score,
    reasons: scoreReasons,
    scope,
  };
}

export function scoreTenderForSME(tender: Tender, scope?: TenderScope) {
  if (scope) {
    return scoreSmeScope(tender, scope);
  }

  const scopes = extractTenderScopes(tender);
  const best = scopes.reduce((currentBest, candidateScope) => {
    const candidateScore = scoreSmeScope(tender, candidateScope);
    return preferCandidateScope(currentBest, candidateScore) ? candidateScore : currentBest;
  }, scoreSmeScope(tender, scopes[0]));

  if (best.scope.kind === "lot") {
    return {
      ...best,
      reasons: [`Best SME-aligned lot: ${best.scope.title}.`, ...best.reasons],
    };
  }

  return best;
}

type ScoreTenderOptions = {
  feedback?: PipelineFeedback;
};

function scoreSearchAgainstScope(search: SavedSearch, tender: Tender, scope: TenderScope) {
  let score = 0;
  const reasons: string[] = [];
  const title = normalizeKeywordText(scope.title);
  const description = normalizeKeywordText(scope.description);

  for (const keyword of search.keywordsInclude) {
    const titleMatch = findKeywordMatchInNormalizedText(title, keyword);
    const descriptionMatch = findKeywordMatchInNormalizedText(description, keyword);

    if (titleMatch) {
      score += 30;
      reasons.push(
        titleMatch === normalizeKeywordText(keyword)
          ? `Keyword '${keyword}' appears in the title.`
          : `Keyword '${keyword}' matches translated wording in the title (${titleMatch}).`,
      );
    } else if (descriptionMatch) {
      score += 15;
      reasons.push(
        descriptionMatch === normalizeKeywordText(keyword)
          ? `Keyword '${keyword}' appears in the description.`
          : `Keyword '${keyword}' matches translated wording in the description (${descriptionMatch}).`,
      );
    }
  }

  for (const keyword of search.keywordsExclude) {
    const titleMatch = findKeywordMatchInNormalizedText(title, keyword);
    const descriptionMatch = findKeywordMatchInNormalizedText(description, keyword);

    if (titleMatch || descriptionMatch) {
      score -= 20;
      reasons.push(`Excluded keyword '${keyword}' is present${titleMatch || descriptionMatch ? ` (${titleMatch || descriptionMatch})` : ""}.`);
    }
  }

  if (
    search.countries.length > 0 &&
    search.countries.some((country) => country.toLowerCase() === tender.country.toLowerCase())
  ) {
    score += 10;
    reasons.push(`Country '${tender.country}' matches the saved search.`);
  }

  if (search.cpvInclude.length > 0) {
    const overlap = tender.cpvCodes.filter((cpv) => search.cpvInclude.includes(cpv));
    if (overlap.length > 0) {
      score += 20;
      reasons.push(`CPV match: ${overlap.join(", ")}.`);
    }
  }

  if (tender.estimatedValue !== null && tender.estimatedValue >= search.minValue) {
    score += 10;
    reasons.push("Estimated value is above the minimum threshold.");
  }

  const days = daysUntil(tender.deadlineAt);
  if (days !== null) {
    if (days < 0) {
      score -= 40;
      reasons.push("Deadline has already passed.");
    } else if (days <= search.maxDaysToDeadline) {
      score += 10;
      reasons.push(`Deadline is within the target window (${days} days away).`);
    }
  }

  const smeFit = scoreTenderForSME(tender, scope);
  if (smeFit.score >= 75) {
    score += 15;
    reasons.push(`Strong SME fit: ${smeFit.reasons[0] ?? "scope looks deliverable for a small specialist team."}`);
  } else if (smeFit.score >= 60) {
    score += 8;
    reasons.push(`Good SME fit: ${smeFit.reasons[0] ?? "scope looks commercially plausible for an SME."}`);
  } else if (smeFit.score <= 35) {
    score -= 15;
    reasons.push(`Weak SME fit: ${smeFit.reasons.at(-1) ?? "contract size or operational load looks too heavy."}`);
  } else if (smeFit.score <= 45) {
    score -= 8;
    reasons.push(`Borderline SME fit: ${smeFit.reasons.at(-1) ?? "scope may be heavier than ideal for a small team."}`);
  }

  return {
    score: clamp(score, 0, 100),
    rawScore: score,
    reasons,
    isMatch: score >= search.minScore,
    smeScore: smeFit.score,
    smeReasons: smeFit.reasons,
    scope,
  };
}

export function scoreTender(
  search: SavedSearch,
  tender: Tender,
  options: ScoreTenderOptions = {},
) {
  const scopes = extractTenderScopes(tender);
  const bestScopeResult = scopes.reduce((currentBest, candidateScope) => {
    const candidate = scoreSearchAgainstScope(search, tender, candidateScope);
    return preferCandidateScope(currentBest, candidate) ? candidate : currentBest;
  }, scoreSearchAgainstScope(search, tender, scopes[0]));

  const feedback = options.feedback ?? { scoreDelta: 0, reasons: [] };
  const reasons = [...bestScopeResult.reasons];

  if (bestScopeResult.scope.kind === "lot") {
    reasons.unshift(`Best matching lot: ${bestScopeResult.scope.title}.`);
  }

  if (feedback.scoreDelta !== 0) {
    reasons.push(...feedback.reasons);
  }

  const adjustedScore = clamp(bestScopeResult.score + feedback.scoreDelta, 0, 100);

  return {
    score: adjustedScore,
    baseScore: bestScopeResult.score,
    reasons,
    isMatch: adjustedScore >= search.minScore,
    smeScore: bestScopeResult.smeScore,
    smeReasons: bestScopeResult.smeReasons,
    scope: bestScopeResult.scope,
    feedbackDelta: feedback.scoreDelta,
    feedbackReasons: feedback.reasons,
  };
}
