import { TenderSource, TenderSourceFetchOptions, TenderSourceFetchResult } from "../types";
import { searchBoampNotices } from "./client";
import { normalizeBoampRecord } from "./normalize";
import { Tender } from "@/lib/types";

const PAGE_SIZE = 100;
const MAX_PAGES = 5; // up to 500 notices per run

export const BoampSource: TenderSource = {
  id: "boamp",
  name: "BOAMP (France)",

  async fetchActiveTenders(options: TenderSourceFetchOptions = {}): Promise<TenderSourceFetchResult> {
    const allTenders: Tender[] = [];
    let page = 1;
    let newestPublishedAt: string | null = options.since ?? null;
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
        const response = await searchBoampNotices(offset, PAGE_SIZE, options.since ?? undefined);
        const records = response.results ?? [];

        if (records.length === 0) break;

        const tenders = records
          .map(normalizeBoampRecord)
          .filter((t): t is Tender => t !== null);

        allTenders.push(...tenders);
        for (const tender of tenders) {
          if (!newestPublishedAt || new Date(tender.publishedAt).getTime() > new Date(newestPublishedAt).getTime()) {
            newestPublishedAt = tender.publishedAt;
          }
        }

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
