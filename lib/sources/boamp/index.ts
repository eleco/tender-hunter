import { TenderSource } from "../types";
import { searchBoampNotices } from "./client";
import { normalizeBoampRecord } from "./normalize";
import { Tender } from "@/lib/types";

const PAGE_SIZE = 100;
const MAX_PAGES = 5; // up to 500 notices per run

export const BoampSource: TenderSource = {
  id: "boamp",
  name: "BOAMP (France)",

  async fetchActiveTenders(): Promise<Tender[]> {
    const allTenders: Tender[] = [];
    let page = 1;

    console.log(`[${this.name}] Starting import (max ${MAX_PAGES} pages)...`);

    while (page <= MAX_PAGES) {
      const offset = (page - 1) * PAGE_SIZE;
      console.log(`[${this.name}] Fetching page ${page} (offset ${offset})...`);

      try {
        const response = await searchBoampNotices(offset, PAGE_SIZE);
        const records = response.results ?? [];

        if (records.length === 0) break;

        const tenders = records
          .map(normalizeBoampRecord)
          .filter((t): t is Tender => t !== null);

        allTenders.push(...tenders);

        if (records.length < PAGE_SIZE) break; // last page

        page++;
        await new Promise((resolve) => setTimeout(resolve, 300)); // gentle rate limiting
      } catch (error) {
        console.error(`[${this.name}] Error on page ${page}:`, error);
        break;
      }
    }

    console.log(`[${this.name}] Import complete. Fetched ${allTenders.length} notices.`);
    return allTenders;
  },
};
