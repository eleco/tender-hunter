import { Tender } from "@/lib/types";

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
    fetchActiveTenders(): Promise<Tender[]>;
}
