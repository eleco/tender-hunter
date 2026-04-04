export type PipelineStatus = "watching" | "drafting" | "submitted" | "won" | "lost" | "passed";
export type TenderLifecycleStatus = "active" | "archived";
export type OpportunityCategory = "tender" | "open-call" | "grant";

export type PipelineEntry = {
  tenderId: string;
  status: PipelineStatus;
  updatedAt: string;
  notes?: string;
};

export type PipelineFeedback = {
  scoreDelta: number;
  reasons: string[];
};

export type SavedSearch = {
  id: string;
  userEmail: string;
  name: string;
  enabled: boolean;
  countries: string[];
  keywordsInclude: string[];
  keywordsExclude: string[];
  cpvInclude: string[];
  minValue: number;
  maxDaysToDeadline: number;
  minScore: number;
};

export type Tender = {
  id: string;
  source: string;
  sourceNoticeId: string;
  sourceUrl: string;
  title: string;
  description: string;
  buyerName: string;
  country: string;
  region?: string;
  currency: string;
  estimatedValue: number | null;
  publishedAt: string;
  deadlineAt: string | null;
  status: string;
  procedureType?: string;
  opportunityCategory?: OpportunityCategory;
  cpvCodes: string[];
  lifecycleStatus: TenderLifecycleStatus;
  archivedAt: string | null;
  archiveReason: string | null;
};

export type TenderScope = {
  id: string;
  kind: "notice" | "lot";
  title: string;
  description: string;
};

export type SearchMatch = {
  searchId: string;
  searchName: string;
  tenderId: string;
  sourceNoticeId: string;
  source: string;
  title: string;
  buyerName: string;
  country: string;
  currency: string;
  estimatedValue: number | null;
  publishedAt: string;
  deadlineAt: string | null;
  opportunityCategory?: OpportunityCategory;
  score: number;
  baseScore?: number;
  matchReasons: string[];
  matchedScope?: TenderScope;
  feedbackDelta?: number;
  feedbackReasons?: string[];
  aiScore?: number;
  aiReasoning?: string;
};
