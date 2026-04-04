import { readSearches, readTenders, upsertTenders } from "@/lib/store";
import { scoreNewMatches } from "@/lib/ai-scoring";
import { TenderSource } from "@/lib/sources/types";
import { TedSource } from "@/lib/sources/ted";
import { BoampSource } from "@/lib/sources/boamp";
import { FindATenderSource } from "@/lib/sources/findatender";
import { EccpFundingSource } from "@/lib/sources/eccp-funding";
import { ImportRunTimings, SourceCheckpointMap } from "@/lib/store-types";
import { createRunBudget } from "@/lib/runtime-budget";
import { maxTimestamp } from "@/lib/time-window";

const SOURCE_CHECKPOINT_OVERLAP_MS = 36 * 60 * 60 * 1000;
const IMPORT_RUNTIME_BUDGET_MS = Number(process.env.IMPORT_RUNTIME_BUDGET_MS || 225000);
const MIN_MS_TO_START_SOURCE = 60000;
const MIN_MS_TO_START_AI_SCORING = 30000;

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
  stoppedEarly?: boolean;
};

export type ImportJobResult = {
  totalImported: number;
  sources: ImportSourceSummary[];
  aiScoringRan: boolean;
  activeSearches: number;
  sourceCheckpoints: SourceCheckpointMap;
  completed: boolean;
  stopReason: string | null;
  timings: ImportRunTimings;
};

type ImportJobOptions = {
  sourceCheckpoints?: SourceCheckpointMap;
  windowStart?: string | null;
};

function withCheckpointOverlap(checkpoint?: string) {
  if (!checkpoint) return null;
  return new Date(new Date(checkpoint).getTime() - SOURCE_CHECKPOINT_OVERLAP_MS).toISOString();
}

// Register all active tender sources here.
// Each source must implement TenderSource: { id, name, fetchActiveTenders() }
const SOURCES: TenderSource[] = [
  TedSource,         // EU-wide above-threshold  (TED Search API v3, free, no auth)
  BoampSource,       // France all-threshold     (BOAMP Socrata API, free, no auth)
  FindATenderSource, // UK above-threshold       (Find a Tender OCDS API, free, no auth)
  EccpFundingSource, // ECCP open calls/funding  (public sitemap + public content pages)
];

export async function runImportJob(
  logger: JobLogger = console,
  options: ImportJobOptions = {},
): Promise<ImportJobResult> {
  const startedAt = Date.now();
  const budget = createRunBudget(IMPORT_RUNTIME_BUDGET_MS);
  const previousCheckpoints = options.sourceCheckpoints ?? {};
  logger.log(`Starting multi-source tender import for ${SOURCES.length} sources...\n`);
  const sources: ImportSourceSummary[] = [];
  const sourceCheckpoints: SourceCheckpointMap = { ...previousCheckpoints };
  let totalImported = 0;
  let dbWriteMs = 0;
  let completed = true;
  let stopReason: string | null = null;

  for (const source of SOURCES) {
    if (budget.shouldStop(MIN_MS_TO_START_SOURCE)) {
      completed = false;
      stopReason = "Stopped before starting the next source to stay within the runtime budget.";
      logger.log(stopReason);
      break;
    }

    logger.log(`=== Fetching from: ${source.name} ===`);
    const sourceStartedAt = Date.now();
    const sourceSince = maxTimestamp(
      withCheckpointOverlap(previousCheckpoints[source.id]),
      options.windowStart,
    );

    try {
      const result = await source.fetchActiveTenders({
        since: sourceSince,
        windowStart: options.windowStart,
        budget,
      });
      const durationMs = Date.now() - sourceStartedAt;
      logger.log(`-> ${source.name} returned ${result.tenders.length} tenders.\n`);

      if (result.tenders.length > 0) {
        logger.log(`Upserting ${result.tenders.length} ${source.name} tenders...`);
        const dbWriteStartedAt = Date.now();
        await upsertTenders(result.tenders);
        dbWriteMs += Date.now() - dbWriteStartedAt;
        totalImported += result.tenders.length;
      }

      if (result.complete !== false && result.nextSince) {
        sourceCheckpoints[source.id] = result.nextSince;
      }

      sources.push({
        id: source.id,
        name: source.name,
        count: result.tenders.length,
        ok: true,
        durationMs,
        stoppedEarly: result.complete === false,
        error: result.stopReason ?? undefined,
      });

      if (result.complete === false) {
        completed = false;
        stopReason = result.stopReason ?? `Stopped early while processing ${source.name}.`;
        break;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const durationMs = Date.now() - sourceStartedAt;
      logger.error(`-> [ERROR] Failed to fetch from ${source.name}:`, error);
      sources.push({
        id: source.id,
        name: source.name,
        count: 0,
        ok: false,
        error: message,
        durationMs,
      });
    }
  }

  const fetchMs = Date.now() - startedAt - dbWriteMs;

  logger.log(`\nImport pipeline complete! Upserted ${totalImported} total notices.`);

  const searches = await readSearches();
  let aiScoringRan = false;
  let aiScoringMs = 0;

  if (completed && searches.length > 0 && !budget.shouldStop(MIN_MS_TO_START_AI_SCORING)) {
    logger.log("\n=== AI Scoring ===");
    const aiScoringStartedAt = Date.now();
    await scoreNewMatches(searches, await readTenders());
    aiScoringMs = Date.now() - aiScoringStartedAt;
    aiScoringRan = true;
  } else if (completed && searches.length > 0) {
    completed = false;
    stopReason = "Skipped AI scoring to stay within the runtime budget.";
    logger.log(stopReason);
  }

  const totalMs = Date.now() - startedAt;
  const budgetRemainingMs = budget.getRemainingMs();

  return {
    totalImported,
    sources,
    aiScoringRan,
    activeSearches: searches.filter((search) => search.enabled).length,
    sourceCheckpoints,
    completed,
    stopReason,
    timings: {
      fetchMs,
      dbWriteMs,
      aiScoringMs,
      totalMs,
      budgetLimitMs: IMPORT_RUNTIME_BUDGET_MS,
      budgetRemainingMs,
    },
  };
}
