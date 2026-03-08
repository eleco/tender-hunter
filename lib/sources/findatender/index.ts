import { TenderSource } from "../types";
import { searchFindTenderNotices, fetchFindTenderNextPage, FindTenderResponse } from "./client";
import { normalizeFindTenderRelease } from "./normalize";
import { Tender } from "@/lib/types";

const PAGE_SIZE = 100;
const MAX_PAGES = 5;

export const FindATenderSource: TenderSource = {
  id: "find-a-tender",
  name: "Find a Tender (UK)",

  async fetchActiveTenders(): Promise<Tender[]> {
    const allTenders: Tender[] = [];
    const updatedFrom = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();
    let page = 1;
    let nextLink: string | undefined;

    console.log(`[${this.name}] Starting import (max ${MAX_PAGES} pages)...`);

    while (page <= MAX_PAGES) {
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

        allTenders.push(...tenders);

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
    return allTenders;
  },
};
