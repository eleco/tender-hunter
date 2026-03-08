export type AiScoreEntry = {
  score: number;
  reasoning: string;
  cachedAt: string;
};

export type AiScoreCache = Record<string, AiScoreEntry>; // key: `${searchId}:${sourceNoticeId}:${scopeId}`
