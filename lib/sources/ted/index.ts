import { TenderSource } from "../types";
import { searchTedNotices } from "./client";
import { normalizeTedNotice } from "./normalize";
import { config } from "@/lib/config";
import { Tender } from "@/lib/types";

const MAX_PAGES_TO_FETCH = 10;

export const TedSource: TenderSource = {
    id: "ted-api-v3",
    name: "Tender Electronic Daily (TED)",

    async fetchActiveTenders(): Promise<Tender[]> {
        let allTenders: Tender[] = [];
        let page = 1;
        let hasMore = true;

        console.log(`[${this.name}] Starting import (max ${MAX_PAGES_TO_FETCH} pages)...`);

        while (hasMore && page <= MAX_PAGES_TO_FETCH) {
            console.log(`[${this.name}] Fetching page ${page}...`);

            try {
                const response = await searchTedNotices(page);
                const notices = Array.isArray(response.notices) ? response.notices : [];

                if (notices.length === 0) break;

                const tenders = notices
                    .map(normalizeTedNotice)
                    .filter((t): t is NonNullable<typeof t> => t !== null);

                allTenders.push(...tenders);

                const limit = config.tedPageSize;
                const totalCount = response.totalNoticeCount || limit;
                const computedTotalPages = Math.ceil(totalCount / limit);
                hasMore = page < computedTotalPages;
                page++;

                // Rate limiting
                await new Promise(resolve => setTimeout(resolve, 500));
            } catch (error) {
                console.error(`[${this.name}] Error fetching page ${page}:`, error);
                break; // Stop fetching on error, but return what we have so far
            }
        }

        console.log(`[${this.name}] Import complete! Fetched ${allTenders.length} notices.`);
        return allTenders;
    }
};
