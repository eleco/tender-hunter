import { TenderSource, TenderSourceFetchOptions, TenderSourceFetchResult } from "../types";
import { mapWithConcurrency } from "@/lib/async";
import { fetchEccpPage, fetchEccpSitemapEntries } from "./client";
import { normalizeEccpOpportunity, shouldIncludeEccpSitemapEntry } from "./normalize";
import { isOnOrAfter, maxTimestamp } from "@/lib/time-window";

const DEFAULT_LOOKBACK_MS = 45 * 24 * 60 * 60 * 1000;
const DETAIL_FETCH_CONCURRENCY = 4;
const MAX_DETAIL_FETCHES = 40;

export const EccpFundingSource: TenderSource = {
  id: "eccp-funding",
  name: "ECCP Funding Opportunities",

  async fetchActiveTenders(options: TenderSourceFetchOptions = {}): Promise<TenderSourceFetchResult> {
    const cutoff = options.since ?? new Date(Date.now() - DEFAULT_LOOKBACK_MS).toISOString();
    const entries = await fetchEccpSitemapEntries();
    const recentEntries = entries
      .filter((entry) => shouldIncludeEccpSitemapEntry(entry, cutoff))
      .sort((a, b) => new Date(b.lastmod ?? 0).getTime() - new Date(a.lastmod ?? 0).getTime())
      .slice(0, MAX_DETAIL_FETCHES);

    let stopReason: string | null = null;

    const pages = await mapWithConcurrency(recentEntries, DETAIL_FETCH_CONCURRENCY, async (entry) => {
      if (options.budget?.shouldStop(45000)) {
        stopReason = "Stopped early before ECCP exhausted recent sitemap entries to stay within the runtime budget.";
        return null;
      }

      const page = await fetchEccpPage(entry.url);
      if (!page) return null;

      const tender = normalizeEccpOpportunity({
        ...page,
        lastmod: entry.lastmod,
      });
      if (!tender) return null;
      if (options.windowStart && !isOnOrAfter(tender.publishedAt, options.windowStart)) return null;
      return tender;
    });

    const tenders = pages.filter((tender): tender is NonNullable<typeof tender> => tender !== null);
    const nextSince = maxTimestamp(...tenders.map((tender) => tender.publishedAt), options.since);

    return {
      tenders,
      nextSince,
      complete: stopReason === null,
      stopReason,
    };
  },
};
