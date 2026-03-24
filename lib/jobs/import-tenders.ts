import { readSearches, readTenders, upsertTenders } from "@/lib/store";
import { scoreNewMatches } from "@/lib/ai-scoring";
import { Tender } from "@/lib/types";
import { TenderSource } from "@/lib/sources/types";
import { TedSource } from "@/lib/sources/ted";
import { BoampSource } from "@/lib/sources/boamp";
import { FindATenderSource } from "@/lib/sources/findatender";
import { mapWithConcurrency } from "@/lib/async";

export type JobLogger = {
  log: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
};

export type ImportSourceSummary = {
  id: string;
  name: string;
  count: number;
  ok: boolean;
  error?: string;
};

export type ImportJobResult = {
  totalImported: number;
  sources: ImportSourceSummary[];
  aiScoringRan: boolean;
  activeSearches: number;
};

// Register all active tender sources here.
// Each source must implement TenderSource: { id, name, fetchActiveTenders() }
const SOURCES: TenderSource[] = [
  TedSource,         // EU-wide above-threshold  (TED Search API v3, free, no auth)
  BoampSource,       // France all-threshold     (BOAMP Socrata API, free, no auth)
  FindATenderSource, // UK above-threshold       (Find a Tender OCDS API, free, no auth)
];

export async function runImportJob(logger: JobLogger = console): Promise<ImportJobResult> {
  logger.log(`Starting multi-source tender import for ${SOURCES.length} sources...\n`);

  const sourceRuns = await mapWithConcurrency(SOURCES, SOURCES.length, async (source) => {
    logger.log(`=== Fetching from: ${source.name} ===`);
    try {
      const tenders = await source.fetchActiveTenders();
      logger.log(`-> ${source.name} returned ${tenders.length} tenders.\n`);
      return {
        tenders,
        summary: {
          id: source.id,
          name: source.name,
          count: tenders.length,
          ok: true,
        } satisfies ImportSourceSummary,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`-> [ERROR] Failed to fetch from ${source.name}:`, error);
      return {
        tenders: [] as Tender[],
        summary: {
          id: source.id,
          name: source.name,
          count: 0,
          ok: false,
          error: message,
        } satisfies ImportSourceSummary,
      };
    }
  });

  const allTenders = sourceRuns.flatMap((run) => run.tenders);
  const sources = sourceRuns.map((run) => run.summary);
  let totalImported = 0;

  if (allTenders.length > 0) {
    logger.log(`\nAggregating and upserting ${allTenders.length} total tenders...`);
    await upsertTenders(allTenders);
    totalImported = allTenders.length;
  }

  logger.log(`\nImport pipeline complete! Upserted ${totalImported} total notices.`);

  const searches = await readSearches();
  let aiScoringRan = false;

  if (searches.length > 0) {
    logger.log("\n=== AI Scoring ===");
    await scoreNewMatches(searches, await readTenders());
    aiScoringRan = true;
  }

  return {
    totalImported,
    sources,
    aiScoringRan,
    activeSearches: searches.filter((search) => search.enabled).length,
  };
}
