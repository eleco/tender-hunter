import { TenderSource, TenderSourceFetchOptions, TenderSourceFetchResult } from "../types";
import { searchBaseNotices } from "./client";
import { normalizeBaseAnuncio } from "./normalize";
import { Tender } from "@/lib/types";

const PAGE_SIZE = 100;
const MAX_PAGES = 5; // up to 500 notices per run

export const BaseSource: TenderSource = {
  id: "base",
  name: "BASE.gov.pt (Portugal)",

  async fetchActiveTenders(options: TenderSourceFetchOptions = {}): Promise<TenderSourceFetchResult> {
    const allTenders: Tender[] = [];
    let page = 0;
    let stopReason: string | null = null;

    console.log(`[${this.name}] Starting import (max ${MAX_PAGES} pages)...`);

    while (page < MAX_PAGES) {
      if (options.budget?.shouldStop?.(45000)) {
        stopReason = "Stopped early before BASE exhausted its pages to stay within the runtime budget.";
        console.log(`[${this.name}] ${stopReason}`);
        break;
      }

      console.log(`[${this.name}] Fetching page ${page + 1}...`);
      try {
        const response = await searchBaseNotices(page, PAGE_SIZE);
        const items = response.items ?? [];

        if (items.length === 0) break;

        const tenders = items
          .map(normalizeBaseAnuncio)
          .filter((t): t is Tender => t !== null);

        allTenders.push(...tenders);

        if (items.length < PAGE_SIZE) break;

        page++;
        await new Promise((resolve) => setTimeout(resolve, 300));
      } catch (error) {
        console.error(`[${this.name}] Error on page ${page + 1}:`, error);
        break;
      }
    }

    console.log(`[${this.name}] Import complete. Fetched ${allTenders.length} notices.`);
    return {
      tenders: allTenders,
      nextSince: allTenders[0]?.publishedAt ?? null,
      complete: stopReason === null,
      stopReason,
    };
  },
};
