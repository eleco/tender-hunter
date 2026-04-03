import { TenderSource, TenderSourceFetchOptions, TenderSourceFetchResult } from "../types";
import { searchTedNotices } from "./client";
import { normalizeTedNotice } from "./normalize";
import { config } from "@/lib/config";
import { Tender } from "@/lib/types";
import { isOnOrAfter, maxTimestamp, startOfUtcDay } from "@/lib/time-window";

const MAX_PAGES_TO_FETCH = 10;

export const TedSource: TenderSource = {
    id: "ted-api-v3",
    name: "Tender Electronic Daily (TED)",

    async fetchActiveTenders(options: TenderSourceFetchOptions = {}): Promise<TenderSourceFetchResult> {
        const cutoff = options.windowStart ?? (options.since ? startOfUtcDay(options.since) : null);
        let allTenders: Tender[] = [];
        let page = 1;
        let hasMore = true;
        let stopReason: string | null = null;
        let newestPublishedAt: string | null = maxTimestamp(options.since, options.windowStart);

        console.log(`[${this.name}] Starting import (max ${MAX_PAGES_TO_FETCH} pages)...`);

        while (hasMore && page <= MAX_PAGES_TO_FETCH) {
            if (options.budget?.shouldStop(45000)) {
                stopReason = "Stopped early before TED exhausted its pages to stay within the runtime budget.";
                console.log(`[${this.name}] ${stopReason}`);
                break;
            }

            console.log(`[${this.name}] Fetching page ${page}...`);

            try {
                const response = await searchTedNotices(page);
                const notices = Array.isArray(response.notices) ? response.notices : [];

                if (notices.length === 0) break;

                const tenders = notices
                    .map(normalizeTedNotice)
                    .filter((t): t is NonNullable<typeof t> => t !== null);
                const freshTenders = cutoff === null
                    ? tenders
                    : tenders.filter((tender) => isOnOrAfter(tender.publishedAt, cutoff));

                allTenders.push(...freshTenders);

                for (const tender of freshTenders) {
                    if (!newestPublishedAt || new Date(tender.publishedAt).getTime() > new Date(newestPublishedAt).getTime()) {
                        newestPublishedAt = tender.publishedAt;
                    }
                }

                const limit = config.tedPageSize;
                const totalCount = response.totalNoticeCount || limit;
                const computedTotalPages = Math.ceil(totalCount / limit);
                hasMore = page < computedTotalPages;

                if (cutoff !== null && freshTenders.length === 0) {
                    break;
                }

                page++;

                // Rate limiting
                await new Promise(resolve => setTimeout(resolve, 500));
            } catch (error) {
                console.error(`[${this.name}] Error fetching page ${page}:`, error);
                break; // Stop fetching on error, but return what we have so far
            }
        }

        console.log(`[${this.name}] Import complete! Fetched ${allTenders.length} notices.`);
        return {
            tenders: allTenders,
            nextSince: newestPublishedAt,
            complete: stopReason === null,
            stopReason,
        };
    }
};
