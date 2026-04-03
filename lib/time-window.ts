export function maxTimestamp(...values: Array<string | null | undefined>): string | null {
  let latestValue: string | null = null;
  let latestMs = Number.NEGATIVE_INFINITY;

  for (const value of values) {
    if (!value) continue;

    const valueMs = Date.parse(value);
    if (Number.isNaN(valueMs)) continue;

    if (latestValue === null || valueMs > latestMs) {
      latestValue = value;
      latestMs = valueMs;
    }
  }

  return latestValue;
}

export function isOnOrAfter(candidate: string, cutoff?: string | null): boolean {
  if (!cutoff) return true;

  const candidateMs = Date.parse(candidate);
  const cutoffMs = Date.parse(cutoff);
  if (Number.isNaN(candidateMs) || Number.isNaN(cutoffMs)) return false;

  return candidateMs >= cutoffMs;
}

export function startOfUtcDay(timestamp: string): string {
  const date = new Date(timestamp);
  date.setUTCHours(0, 0, 0, 0);
  return date.toISOString();
}
