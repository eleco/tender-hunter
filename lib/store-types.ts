export type AiScoreEntry = {
  score: number;
  reasoning: string;
  cachedAt: string;
};

export type AiScoreCache = Record<string, AiScoreEntry>; // key: `${searchId}:${sourceNoticeId}:${scopeId}`

export type CronRunStatus = "running" | "succeeded" | "failed";

export type ImportSourceTiming = {
  id: string;
  name: string;
  count: number;
  ok: boolean;
  error?: string;
  durationMs: number;
};

export type ImportRunTimings = {
  fetchMs: number;
  dbWriteMs: number;
  aiScoringMs: number;
  totalMs: number;
};

export type CronRunRecord = {
  key: "daily-cron";
  runId: string;
  status: CronRunStatus;
  startedAt: string;
  finishedAt: string | null;
  failedAt: string | null;
  durationMs: number | null;
  totalExtracted: number | null;
  aiScoringRan: boolean | null;
  activeSearches: number | null;
  digestMode: "matches" | "recent-tenders" | null;
  digestDelivered: boolean | null;
  digestItemCount: number | null;
  error: string | null;
  sourceMetrics: ImportSourceTiming[];
  timings: ImportRunTimings | null;
  updatedAt: string;
};
