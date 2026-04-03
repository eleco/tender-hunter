import { TenderSource, TenderSourceFetchOptions, TenderSourceFetchResult } from "../types";
import { searchFindTenderNotices, fetchFindTenderNextPage, FindTenderResponse } from "./client";
import { normalizeFindTenderRelease } from "./normalize";
import { Tender } from "@/lib/types";
import { isOnOrAfter, maxTimestamp } from "@/lib/time-window";

const PAGE_SIZE = 100;
const MAX_PAGES = 5;

export const FindATenderSource: TenderSource = {
  id: "find-a-tender",
  name: "Find a Tender (UK)",

  async fetchActiveTenders(options: TenderSourceFetchOptions = {}): Promise<TenderSourceFetchResult> {
    const allTenders: Tender[] = [];
    const fetchStartedAt = new Date().toISOString();
    const updatedFrom = maxTimestamp(options.since, options.windowStart)
      ?? new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();
    let page = 1;
    let nextLink: string | undefined;
    let stopReason: string | null = null;

    console.log(`[${this.name}] Starting import (max ${MAX_PAGES} pages)...`);

    while (page <= MAX_PAGES) {
      if (options.budget?.shouldStop(45000)) {
        stopReason = "Stopped early before Find a Tender exhausted its pages to stay within the runtime budget.";
        console.log(`[${this.name}] ${stopReason}`);
        break;
      }

      console.log(`[${this.name}] Fetching page ${page}...`);
      try {
        // First page uses the search function; subsequent pages follow nextLink
        const response: FindTenderResponse = page === 1
          ? await searchFindTenderNotices(updatedFrom, PAGE_SIZE)
          : await fetchFindTenderNextPage(nextLink!);

        const releases = response.releases ?? [];
        if (releases.length === 0) break;

        const tenders = releases
          .map(normalizeFindTenderRelease)
          .filter((t): t is Tender => t !== null);
        const freshTenders = options.windowStart
          ? tenders.filter((tender) => isOnOrAfter(tender.publishedAt, options.windowStart))
          : tenders;

        allTenders.push(...freshTenders);

        if (!response.nextLink) break;
        nextLink = response.nextLink;
        page++;
        await new Promise((resolve) => setTimeout(resolve, 300));
      } catch (error) {
        console.error(`[${this.name}] Error on page ${page}:`, error);
        break;
      }
    }

    console.log(`[${this.name}] Import complete. Fetched ${allTenders.length} notices.`);
    return {
      tenders: allTenders,
      nextSince: fetchStartedAt,
      complete: stopReason === null,
      stopReason,
    };
  },
};
