export type RunBudget = {
  limitMs: number;
  getRemainingMs: () => number;
  shouldStop: (bufferMs?: number) => boolean;
};

export function createRunBudget(limitMs: number): RunBudget {
  const startedAt = Date.now();

  return {
    limitMs,
    getRemainingMs() {
      return Math.max(0, limitMs - (Date.now() - startedAt));
    },
    shouldStop(bufferMs = 0) {
      return Date.now() - startedAt >= Math.max(0, limitMs - bufferMs);
    },
  };
}
