import { readSearches, readTenders, upsertTenders } from "@/lib/store";
import { scoreNewMatches } from "@/lib/ai-scoring";
import { Tender } from "@/lib/types";
import { TenderSource } from "@/lib/sources/types";
import { TedSource } from "@/lib/sources/ted";
import { BoampSource } from "@/lib/sources/boamp";
import { FindATenderSource } from "@/lib/sources/findatender";
import { mapWithConcurrency } from "@/lib/async";
import { ImportRunTimings } from "@/lib/store-types";

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
  durationMs: number;
};

export type ImportJobResult = {
  totalImported: number;
  sources: ImportSourceSummary[];
  aiScoringRan: boolean;
  activeSearches: number;
  timings: ImportRunTimings;
};

// Register all active tender sources here.
// Each source must implement TenderSource: { id, name, fetchActiveTenders() }
const SOURCES: TenderSource[] = [
  TedSource,         // EU-wide above-threshold  (TED Search API v3, free, no auth)
  BoampSource,       // France all-threshold     (BOAMP Socrata API, free, no auth)
  FindATenderSource, // UK above-threshold       (Find a Tender OCDS API, free, no auth)
];

export async function runImportJob(logger: JobLogger = console): Promise<ImportJobResult> {
  const startedAt = Date.now();
  logger.log(`Starting multi-source tender import for ${SOURCES.length} sources...\n`);

  const sourceRuns = await mapWithConcurrency(SOURCES, SOURCES.length, async (source) => {
    logger.log(`=== Fetching from: ${source.name} ===`);
    const sourceStartedAt = Date.now();
    try {
      const tenders = await source.fetchActiveTenders();
      const durationMs = Date.now() - sourceStartedAt;
      logger.log(`-> ${source.name} returned ${tenders.length} tenders.\n`);
      return {
        tenders,
        summary: {
          id: source.id,
          name: source.name,
          count: tenders.length,
          ok: true,
          durationMs,
        } satisfies ImportSourceSummary,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const durationMs = Date.now() - sourceStartedAt;
      logger.error(`-> [ERROR] Failed to fetch from ${source.name}:`, error);
      return {
        tenders: [] as Tender[],
        summary: {
          id: source.id,
          name: source.name,
          count: 0,
          ok: false,
          error: message,
          durationMs,
        } satisfies ImportSourceSummary,
      };
    }
  });

  const allTenders = sourceRuns.flatMap((run) => run.tenders);
  const sources = sourceRuns.map((run) => run.summary);
  const fetchMs = Date.now() - startedAt;
  let totalImported = 0;
  let dbWriteMs = 0;

  if (allTenders.length > 0) {
    logger.log(`\nAggregating and upserting ${allTenders.length} total tenders...`);
    const dbWriteStartedAt = Date.now();
    await upsertTenders(allTenders);
    dbWriteMs = Date.now() - dbWriteStartedAt;
    totalImported = allTenders.length;
  }

  logger.log(`\nImport pipeline complete! Upserted ${totalImported} total notices.`);

  const searches = await readSearches();
  let aiScoringRan = false;
  let aiScoringMs = 0;

  if (searches.length > 0) {
    logger.log("\n=== AI Scoring ===");
    const aiScoringStartedAt = Date.now();
    await scoreNewMatches(searches, await readTenders());
    aiScoringMs = Date.now() - aiScoringStartedAt;
    aiScoringRan = true;
  }

  const totalMs = Date.now() - startedAt;

  return {
    totalImported,
    sources,
    aiScoringRan,
    activeSearches: searches.filter((search) => search.enabled).length,
    timings: {
      fetchMs,
      dbWriteMs,
      aiScoringMs,
      totalMs,
    },
  };
}
