import { Tender } from "@/lib/types";
import { RunBudget } from "@/lib/runtime-budget";

export type TenderSourceFetchOptions = {
    since?: string | null;
    windowStart?: string | null;
    budget?: RunBudget;
};

export type TenderSourceFetchResult = {
    tenders: Tender[];
    nextSince?: string | null;
    complete?: boolean;
    stopReason?: string | null;
};

export interface TenderSource {
    /**
     * Internal identifier for the source (e.g. "ted", "contracts-finder")
     */
    id: string;

    /**
     * Human-readable name for the source
     */
    name: string;

    /**
     * Fetches active (open) tenders from the source.
     * Internal pagination/looping should be handled within this method.
     */
    fetchActiveTenders(options?: TenderSourceFetchOptions): Promise<TenderSourceFetchResult>;
}
