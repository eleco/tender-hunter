import { TenderSource, TenderSourceFetchOptions, TenderSourceFetchResult } from "../types";
import { searchBoampNotices } from "./client";
import { normalizeBoampRecord } from "./normalize";
import { Tender } from "@/lib/types";
import { isOnOrAfter, maxTimestamp } from "@/lib/time-window";

const PAGE_SIZE = 100;
const MAX_PAGES = 5; // up to 500 notices per run

export const BoampSource: TenderSource = {
  id: "boamp",
  name: "BOAMP (France)",

  async fetchActiveTenders(options: TenderSourceFetchOptions = {}): Promise<TenderSourceFetchResult> {
    const allTenders: Tender[] = [];
    let page = 1;
    const querySince = maxTimestamp(options.since, options.windowStart);
    let newestPublishedAt: string | null = maxTimestamp(options.since, options.windowStart);
    let stopReason: string | null = null;

    console.log(`[${this.name}] Starting import (max ${MAX_PAGES} pages)...`);

    while (page <= MAX_PAGES) {
      if (options.budget?.shouldStop(45000)) {
        stopReason = "Stopped early before BOAMP exhausted its pages to stay within the runtime budget.";
        console.log(`[${this.name}] ${stopReason}`);
        break;
      }

      const offset = (page - 1) * PAGE_SIZE;
      console.log(`[${this.name}] Fetching page ${page} (offset ${offset})...`);

      try {
        const response = await searchBoampNotices(offset, PAGE_SIZE, querySince ?? undefined);
        const records = response.results ?? [];

        if (records.length === 0) break;

        const tenders = records
          .map(normalizeBoampRecord)
          .filter((t): t is Tender => t !== null);
        const freshTenders = options.windowStart
          ? tenders.filter((tender) => isOnOrAfter(tender.publishedAt, options.windowStart))
          : tenders;

        allTenders.push(...freshTenders);
        for (const tender of freshTenders) {
          if (!newestPublishedAt || new Date(tender.publishedAt).getTime() > new Date(newestPublishedAt).getTime()) {
            newestPublishedAt = tender.publishedAt;
          }
        }

        if (options.windowStart && freshTenders.length === 0) break;
        if (records.length < PAGE_SIZE) break; // last page

        page++;
        await new Promise((resolve) => setTimeout(resolve, 300)); // gentle rate limiting
      } catch (error) {
        console.error(`[${this.name}] Error on page ${page}:`, error);
        break;
      }
    }

    console.log(`[${this.name}] Import complete. Fetched ${allTenders.length} notices.`);
    return {
      tenders: allTenders,
      nextSince: newestPublishedAt,
      complete: stopReason === null,
      stopReason,
    };
  },
};
