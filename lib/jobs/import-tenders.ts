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
import { mapWithConcurrency } from "@/lib/async";
import { Tender } from "@/lib/types";

const SOURCE_CHECKPOINT_OVERLAP_MS = 36 * 60 * 60 * 1000;
const IMPORT_RUNTIME_BUDGET_MS = Number(process.env.IMPORT_RUNTIME_BUDGET_MS || 225000);
const IMPORT_SOURCE_CONCURRENCY = Math.max(1, Number(process.env.IMPORT_SOURCE_CONCURRENCY || 2));
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

type SourceFetchOutcome =
  | {
      source: TenderSource;
      started: false;
      budgetStop: true;
    }
  | {
      source: TenderSource;
      started: true;
      tenders: Tender[];
      nextSince: string | null;
      complete: boolean;
      stopReason?: string;
      durationMs: number;
      ok: true;
    }
  | {
      source: TenderSource;
      started: true;
      tenders: [];
      nextSince: null;
      complete: true;
      durationMs: number;
      ok: false;
      error: string;
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
  logger.log(
    `Starting multi-source tender import for ${SOURCES.length} sources with concurrency ${Math.min(IMPORT_SOURCE_CONCURRENCY, SOURCES.length)}...\n`,
  );
  const sources: ImportSourceSummary[] = [];
  const sourceCheckpoints: SourceCheckpointMap = { ...previousCheckpoints };
  let totalImported = 0;
  let dbWriteMs = 0;
  let completed = true;
  let stopReason: string | null = null;

  const fetchOutcomes = await mapWithConcurrency(
    SOURCES,
    IMPORT_SOURCE_CONCURRENCY,
    async (source): Promise<SourceFetchOutcome> => {
      if (budget.shouldStop(MIN_MS_TO_START_SOURCE)) {
        return {
          source,
          started: false,
          budgetStop: true,
        };
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

        return {
          source,
          started: true,
          tenders: result.tenders,
          nextSince: result.nextSince ?? null,
          complete: result.complete !== false,
          stopReason: result.stopReason ?? undefined,
          durationMs,
          ok: true,
        };
      } catch (error) {
        const durationMs = Date.now() - sourceStartedAt;
        const message = error instanceof Error ? error.message : String(error);
        logger.error(`-> [ERROR] Failed to fetch from ${source.name}:`, error);

        return {
          source,
          started: true,
          tenders: [],
          nextSince: null,
          complete: true,
          durationMs,
          ok: false,
          error: message,
        };
      }
    },
  );

  for (const outcome of fetchOutcomes) {
    if (!outcome.started) {
      completed = false;
      if (!stopReason) {
        stopReason = "Stopped before starting the next source to stay within the runtime budget.";
        logger.log(stopReason);
      }
      continue;
    }

    if (outcome.ok) {
      if (outcome.tenders.length > 0) {
        logger.log(`Upserting ${outcome.tenders.length} ${outcome.source.name} tenders...`);
        const dbWriteStartedAt = Date.now();
        await upsertTenders(outcome.tenders);
        dbWriteMs += Date.now() - dbWriteStartedAt;
        totalImported += outcome.tenders.length;
      }

      if (outcome.complete && outcome.nextSince) {
        sourceCheckpoints[outcome.source.id] = outcome.nextSince;
      }

      sources.push({
        id: outcome.source.id,
        name: outcome.source.name,
        count: outcome.tenders.length,
        ok: true,
        durationMs: outcome.durationMs,
        stoppedEarly: !outcome.complete,
        error: outcome.stopReason ?? undefined,
      });

      if (!outcome.complete && !stopReason) {
        completed = false;
        stopReason = outcome.stopReason ?? `Stopped early while processing ${outcome.source.name}.`;
      } else if (!outcome.complete) {
        completed = false;
      }

      continue;
    }

    sources.push({
      id: outcome.source.id,
      name: outcome.source.name,
      count: 0,
      ok: false,
      error: outcome.error,
      durationMs: outcome.durationMs,
    });
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
