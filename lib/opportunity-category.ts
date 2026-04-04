import type { OpportunityCategory, SearchMatch, Tender } from "@/lib/types";

type OpportunityLike = Pick<Tender, "source" | "title" | "description" | "procedureType" | "opportunityCategory">;
type MatchLike = Pick<SearchMatch, "source" | "title" | "opportunityCategory"> & {
  description?: string;
  procedureType?: string;
};

const PROCUREMENT_SOURCES = new Set(["ted", "boamp", "find-a-tender", "base"]);
const TENDER_PATTERNS = [
  /\bopen procedure\b/i,
  /\bcompetitive procedure\b/i,
  /\brestricted procedure\b/i,
  /\bnegotiated procedure\b/i,
  /\bappel[_ -]?offre\b/i,
  /\bconcurso\b/i,
  /\bmapa\b/i,
  /\bprocurement\b/i,
  /\btender\b/i,
  /\bcontract notice\b/i,
];
const GRANT_PATTERNS = [
  /\bgrants?\b/i,
  /\bcascade funding\b/i,
  /\bfunding\b/i,
  /\bfinancial support\b/i,
  /\bvouchers?\b/i,
  /\bcofund\b/i,
  /\bsubsid(?:y|ies)\b/i,
];
const OPEN_CALL_PATTERNS = [
  /\bopen calls?\b/i,
  /\bcall for proposals?\b/i,
  /\bcall for applications?\b/i,
  /\bcall for expression(?:s)? of interest\b/i,
  /\bapplications? (?:are )?open\b/i,
];

function matchesAny(text: string, patterns: RegExp[]) {
  return patterns.some((pattern) => pattern.test(text));
}

export function getOpportunityCategory(item: OpportunityLike | MatchLike): OpportunityCategory {
  if (item.opportunityCategory) return item.opportunityCategory;

  const source = item.source.trim().toLowerCase();
  const contentText = `${item.title} ${item.description ?? ""}`.trim();
  const procedureText = `${item.procedureType ?? ""}`.trim();
  const fullText = `${contentText} ${procedureText}`.trim();

  if (PROCUREMENT_SOURCES.has(source) || matchesAny(fullText, TENDER_PATTERNS)) {
    return "tender";
  }

  if (matchesAny(contentText, GRANT_PATTERNS)) {
    return "grant";
  }

  if (matchesAny(fullText, OPEN_CALL_PATTERNS)) {
    return "open-call";
  }

  if (source === "eccp-funding") {
    return "open-call";
  }

  return "tender";
}

export function getOpportunityCategoryLabel(category: OpportunityCategory) {
  switch (category) {
    case "grant":
      return "Grant";
    case "open-call":
      return "Open call";
    default:
      return "Tender";
  }
}

export function countByOpportunityCategory(items: Array<OpportunityLike | MatchLike>) {
  const counts: Record<OpportunityCategory, number> = {
    tender: 0,
    "open-call": 0,
    grant: 0,
  };

  for (const item of items) {
    counts[getOpportunityCategory(item)] += 1;
  }

  return counts;
}
