import { randomUUID } from "node:crypto";
import { Prisma, PipelineStatus as PrismaPipelineStatus, SavedSearch as PrismaSavedSearch, PipelineEntry as PrismaPipelineEntry, Tender as PrismaTender, TenderLifecycleStatus as PrismaTenderLifecycleStatus, TenderScopeKind, TenderCpvCode, CronRunState as PrismaCronRunState } from "@prisma/client";
import { getPrismaClient } from "@/lib/db";
import { extractTenderScopes } from "@/lib/lots";
import { AiScoreCache, CronRunRecord, ImportRunTimings, ImportSourceTiming, SourceCheckpointMap } from "@/lib/store-types";
import { PipelineEntry, PipelineStatus, SavedSearch, Tender, TenderLifecycleStatus } from "@/lib/types";
import { mapWithConcurrency } from "@/lib/async";

const SEARCH_WRITE_CONCURRENCY = 8;
const TENDER_UPDATE_CONCURRENCY = 8;

function toPrismaLifecycleStatus(status: TenderLifecycleStatus): PrismaTenderLifecycleStatus {
  return status === "archived" ? PrismaTenderLifecycleStatus.archived : PrismaTenderLifecycleStatus.active;
}

function toDomainLifecycleStatus(status: PrismaTenderLifecycleStatus): TenderLifecycleStatus {
  return status === PrismaTenderLifecycleStatus.archived ? "archived" : "active";
}

function toPrismaPipelineStatus(status: PipelineStatus): PrismaPipelineStatus {
  return status as PrismaPipelineStatus;
}

function decimalToNumber(value: Prisma.Decimal | null) {
  return value === null ? null : value.toNumber();
}

type TenderRecord = PrismaTender & {
  cpvCodes: TenderCpvCode[];
};

function mapTender(tender: TenderRecord): Tender {
  return {
    id: tender.id,
    source: tender.source,
    sourceNoticeId: tender.sourceNoticeId,
    sourceUrl: tender.sourceUrl,
    title: tender.title,
    description: tender.description,
    buyerName: tender.buyerName,
    country: tender.country,
    region: tender.region ?? undefined,
    currency: tender.currency,
    estimatedValue: decimalToNumber(tender.estimatedValue),
    publishedAt: tender.publishedAt.toISOString(),
    deadlineAt: tender.deadlineAt?.toISOString() ?? null,
    status: tender.status,
    procedureType: tender.procedureType ?? undefined,
    cpvCodes: tender.cpvCodes.map((item) => item.cpvCode),
    lifecycleStatus: toDomainLifecycleStatus(tender.lifecycleStatus),
    archivedAt: tender.archivedAt?.toISOString() ?? null,
    archiveReason: tender.archiveReason,
  };
}

function mapSearch(search: PrismaSavedSearch): SavedSearch {
  return {
    id: search.id,
    userEmail: search.userEmail,
    name: search.name,
    enabled: search.enabled,
    countries: search.countries,
    keywordsInclude: search.keywordsInclude,
    keywordsExclude: search.keywordsExclude,
    cpvInclude: search.cpvInclude,
    minValue: decimalToNumber(search.minValue) ?? 0,
    maxDaysToDeadline: search.maxDaysToDeadline,
    minScore: search.minScore,
  };
}

function mapPipelineEntry(entry: PrismaPipelineEntry): PipelineEntry {
  return {
    tenderId: entry.tenderId,
    status: entry.status as PipelineStatus,
    updatedAt: entry.updatedAt.toISOString(),
    notes: entry.notes ?? undefined,
  };
}

function mapCronRun(run: PrismaCronRunState): CronRunRecord {
  return {
    key: "daily-cron",
    runId: run.runId,
    status: run.status as CronRunRecord["status"],
    startedAt: run.startedAt.toISOString(),
    finishedAt: run.finishedAt?.toISOString() ?? null,
    failedAt: run.failedAt?.toISOString() ?? null,
    durationMs: run.durationMs,
    totalExtracted: run.totalExtracted,
    aiScoringRan: run.aiScoringRan,
    activeSearches: run.activeSearches,
    digestMode: (run.digestMode as CronRunRecord["digestMode"]) ?? null,
    digestDelivered: run.digestDelivered,
    digestItemCount: run.digestItemCount,
    error: run.error,
    stopReason: run.stopReason,
    sourceMetrics: ((run.sourceMetrics as ImportSourceTiming[] | null) ?? []),
    sourceCheckpoints: ((run.sourceCheckpoints as SourceCheckpointMap | null) ?? {}),
    timings: (run.timings as ImportRunTimings | null) ?? null,
    updatedAt: run.updatedAt.toISOString(),
  };
}

function toNullableJsonInput(value: Prisma.InputJsonValue | null) {
  return value === null ? Prisma.JsonNull : value;
}

function getTenderWriteInput(tender: Tender) {
  const lots = extractTenderScopes(tender)
    .filter((scope) => scope.kind === "lot")
    .map((scope) => ({
      scopeId: scope.id,
      kind: TenderScopeKind.lot,
      title: scope.title,
      description: scope.description,
    }));

  return {
    id: tender.id || randomUUID(),
    source: tender.source,
    sourceNoticeId: tender.sourceNoticeId,
    sourceUrl: tender.sourceUrl,
    title: tender.title,
    description: tender.description,
    buyerName: tender.buyerName,
    country: tender.country,
    region: tender.region ?? null,
    currency: tender.currency,
    estimatedValue: tender.estimatedValue !== null ? new Prisma.Decimal(tender.estimatedValue) : null,
    publishedAt: new Date(tender.publishedAt),
    deadlineAt: tender.deadlineAt ? new Date(tender.deadlineAt) : null,
    status: tender.status,
    procedureType: tender.procedureType ?? null,
    lifecycleStatus: toPrismaLifecycleStatus(tender.lifecycleStatus),
    archivedAt: tender.archivedAt ? new Date(tender.archivedAt) : null,
    archiveReason: tender.archiveReason ?? null,
    cpvCodes: tender.cpvCodes.map((cpvCode) => ({ cpvCode })),
    lots,
  };
}

type PreparedTenderWrite = {
  tenderId: string;
  sourceNoticeId: string;
  createData: Omit<ReturnType<typeof getTenderWriteInput>, "cpvCodes" | "lots">;
  updateData: Omit<ReturnType<typeof getTenderWriteInput>, "id" | "cpvCodes" | "lots">;
  cpvRows: Array<{ tenderId: string; cpvCode: string }>;
  lotRows: Array<{
    id: string;
    tenderId: string;
    scopeId: string;
    kind: TenderScopeKind;
    title: string;
    description: string;
  }>;
  isNew: boolean;
};

function dedupeTendersBySourceNoticeId(tenders: Tender[]) {
  const byNoticeId = new Map<string, Tender>();

  for (const tender of tenders) {
    byNoticeId.set(tender.sourceNoticeId, tender);
  }

  return [...byNoticeId.values()];
}

async function prepareTenderWrites(prisma: ReturnType<typeof getPrismaClient>, tenders: Tender[]) {
  const dedupedTenders = dedupeTendersBySourceNoticeId(tenders);
  const noticeIds = dedupedTenders.map((tender) => tender.sourceNoticeId);
  const existing = noticeIds.length > 0
    ? await prisma.tender.findMany({
        where: {
          sourceNoticeId: {
            in: noticeIds,
          },
        },
        select: {
          id: true,
          sourceNoticeId: true,
        },
      })
    : [];
  const existingByNoticeId = new Map(existing.map((tender) => [tender.sourceNoticeId, tender.id]));

  return dedupedTenders.map((tender): PreparedTenderWrite => {
    const input = getTenderWriteInput(tender);
    const tenderId = existingByNoticeId.get(tender.sourceNoticeId) ?? input.id;
    const updateData = {
      source: input.source,
      sourceNoticeId: input.sourceNoticeId,
      sourceUrl: input.sourceUrl,
      title: input.title,
      description: input.description,
      buyerName: input.buyerName,
      country: input.country,
      region: input.region,
      currency: input.currency,
      estimatedValue: input.estimatedValue,
      publishedAt: input.publishedAt,
      deadlineAt: input.deadlineAt,
      status: input.status,
      procedureType: input.procedureType,
      lifecycleStatus: input.lifecycleStatus,
      archivedAt: input.archivedAt,
      archiveReason: input.archiveReason,
    } satisfies PreparedTenderWrite["updateData"];

    return {
      tenderId,
      sourceNoticeId: tender.sourceNoticeId,
      createData: {
        id: tenderId,
        ...updateData,
      },
      updateData,
      cpvRows: input.cpvCodes.map((cpv) => ({
        tenderId,
        cpvCode: cpv.cpvCode,
      })),
      lotRows: input.lots.map((lot) => ({
        id: randomUUID(),
        tenderId,
        scopeId: lot.scopeId,
        kind: lot.kind,
        title: lot.title,
        description: lot.description,
      })),
      isNew: !existingByNoticeId.has(tender.sourceNoticeId),
    };
  });
}

async function replaceTenderChildRows(
  prisma: ReturnType<typeof getPrismaClient>,
  writes: PreparedTenderWrite[],
) {
  const tenderIds = writes.map((write) => write.tenderId);

  if (tenderIds.length === 0) {
    return;
  }

  await prisma.tenderCpvCode.deleteMany({
    where: {
      tenderId: {
        in: tenderIds,
      },
    },
  });

  const cpvRows = writes.flatMap((write) => write.cpvRows);
  if (cpvRows.length > 0) {
    await prisma.tenderCpvCode.createMany({
      data: cpvRows,
      skipDuplicates: true,
    });
  }

  await prisma.tenderLot.deleteMany({
    where: {
      tenderId: {
        in: tenderIds,
      },
    },
  });

  const lotRows = writes.flatMap((write) => write.lotRows);
  if (lotRows.length > 0) {
    await prisma.tenderLot.createMany({
      data: lotRows,
    });
  }
}

async function persistTenders(
  prisma: ReturnType<typeof getPrismaClient>,
  tenders: Tender[],
  options: { deleteMissing: boolean },
) {
  const writes = await prepareTenderWrites(prisma, tenders);
  const keepNoticeIds = writes.map((write) => write.sourceNoticeId);

  if (options.deleteMissing) {
    if (keepNoticeIds.length > 0) {
      await prisma.tender.deleteMany({
        where: {
          sourceNoticeId: {
            notIn: keepNoticeIds,
          },
        },
      });
    } else {
      await prisma.tender.deleteMany();
    }
  }

  const newRows = writes.filter((write) => write.isNew).map((write) => write.createData);
  if (newRows.length > 0) {
    await prisma.tender.createMany({
      data: newRows,
      skipDuplicates: true,
    });
  }

  const existingRows = writes.filter((write) => !write.isNew);
  await mapWithConcurrency(existingRows, TENDER_UPDATE_CONCURRENCY, async (write) => {
    await prisma.tender.update({
      where: { id: write.tenderId },
      data: write.updateData,
    });
  });

  await replaceTenderChildRows(prisma, writes);
}

export async function readTenders(): Promise<Tender[]> {
  const prisma = getPrismaClient();
  const tenders = await prisma.tender.findMany({
    include: {
      cpvCodes: true,
    },
    orderBy: {
      publishedAt: "desc",
    },
  });

  return tenders.map(mapTender);
}

export async function writeTenders(tenders: Tender[]) {
  const prisma = getPrismaClient();
  await persistTenders(prisma, tenders, { deleteMissing: true });
}

export async function readSearches(): Promise<SavedSearch[]> {
  const prisma = getPrismaClient();
  const searches = await prisma.savedSearch.findMany({
    orderBy: {
      createdAt: "desc",
    },
  });

  return searches.map(mapSearch);
}

export async function writeSearches(searches: SavedSearch[]) {
  const prisma = getPrismaClient();
  const keepIds = searches.map((search) => search.id);

  if (keepIds.length > 0) {
    await prisma.savedSearch.deleteMany({
      where: {
        id: {
          notIn: keepIds,
        },
      },
    });
  } else {
    await prisma.savedSearch.deleteMany();
  }

  await mapWithConcurrency(searches, SEARCH_WRITE_CONCURRENCY, async (search) => {
    await prisma.savedSearch.upsert({
      where: { id: search.id },
      create: {
        ...search,
        minValue: new Prisma.Decimal(search.minValue),
      },
      update: {
        ...search,
        minValue: new Prisma.Decimal(search.minValue),
      },
    });
  });
}

export async function upsertSearch(input: Omit<SavedSearch, "id">): Promise<SavedSearch> {
  const prisma = getPrismaClient();
  const search = await prisma.savedSearch.create({
    data: {
      ...input,
      minValue: new Prisma.Decimal(input.minValue),
    },
  });

  return mapSearch(search);
}

export async function deleteSearch(id: string): Promise<void> {
  const prisma = getPrismaClient();
  await prisma.savedSearch.delete({
    where: { id },
  });
}

export async function setSearchEnabled(id: string, enabled: boolean): Promise<void> {
  const prisma = getPrismaClient();
  await prisma.savedSearch.update({
    where: { id },
    data: { enabled },
  });
}

export async function readAiScores(): Promise<AiScoreCache> {
  const prisma = getPrismaClient();
  const entries = await prisma.aiScore.findMany();
  return Object.fromEntries(
    entries.map((entry) => [
      entry.key,
      {
        score: entry.score,
        reasoning: entry.reasoning,
        cachedAt: entry.cachedAt.toISOString(),
      },
    ]),
  );
}

export async function writeAiScores(cache: AiScoreCache) {
  const prisma = getPrismaClient();
  const keys = Object.keys(cache);

  await prisma.$transaction(async (tx) => {
    if (keys.length > 0) {
      await tx.aiScore.deleteMany({
        where: {
          key: {
            notIn: keys,
          },
        },
      });
    } else {
      await tx.aiScore.deleteMany();
    }

    for (const [key, entry] of Object.entries(cache)) {
      const [searchId, sourceNoticeId, ...scopeParts] = key.split(":");
      const scopeId = scopeParts.length > 0 ? scopeParts.join(":") : null;
      const tender = await tx.tender.findUnique({
        where: { sourceNoticeId },
        select: { id: true },
      });

      if (!tender) {
        continue;
      }

      await tx.aiScore.upsert({
        where: { key },
        create: {
          key,
          searchId,
          tenderId: tender.id,
          scopeId,
          score: entry.score,
          reasoning: entry.reasoning,
          cachedAt: new Date(entry.cachedAt),
        },
        update: {
          searchId,
          tenderId: tender.id,
          scopeId,
          score: entry.score,
          reasoning: entry.reasoning,
          cachedAt: new Date(entry.cachedAt),
        },
      });
    }
  });
}

export async function readPipeline(): Promise<PipelineEntry[]> {
  const prisma = getPrismaClient();
  const entries = await prisma.pipelineEntry.findMany({
    orderBy: {
      updatedAt: "desc",
    },
  });

  return entries.map(mapPipelineEntry);
}

export async function writePipeline(entries: PipelineEntry[]) {
  const prisma = getPrismaClient();
  const keepTenderIds = entries.map((entry) => entry.tenderId);

  await prisma.$transaction(async (tx) => {
    if (keepTenderIds.length > 0) {
      await tx.pipelineEntry.deleteMany({
        where: {
          tenderId: {
            notIn: keepTenderIds,
          },
        },
      });
    } else {
      await tx.pipelineEntry.deleteMany();
    }

    for (const entry of entries) {
      await tx.pipelineEntry.upsert({
        where: { tenderId: entry.tenderId },
        create: {
          tenderId: entry.tenderId,
          status: toPrismaPipelineStatus(entry.status),
          updatedAt: new Date(entry.updatedAt),
          notes: entry.notes ?? null,
        },
        update: {
          status: toPrismaPipelineStatus(entry.status),
          updatedAt: new Date(entry.updatedAt),
          notes: entry.notes ?? null,
        },
      });
    }
  });
}

export async function getPipelineEntry(tenderId: string): Promise<PipelineEntry | undefined> {
  const prisma = getPrismaClient();
  const entry = await prisma.pipelineEntry.findUnique({
    where: { tenderId },
  });

  return entry ? mapPipelineEntry(entry) : undefined;
}

export async function setPipelineStatus(tenderId: string, status: PipelineStatus, notes?: string) {
  const prisma = getPrismaClient();
  await prisma.pipelineEntry.upsert({
    where: { tenderId },
    create: {
      tenderId,
      status: toPrismaPipelineStatus(status),
      updatedAt: new Date(),
      notes: notes ?? null,
    },
    update: {
      status: toPrismaPipelineStatus(status),
      updatedAt: new Date(),
      notes: notes ?? null,
    },
  });
}

export async function getPipelineCounts(): Promise<Record<PipelineStatus, number>> {
  const counts: Record<PipelineStatus, number> = {
    watching: 0,
    drafting: 0,
    submitted: 0,
    won: 0,
    lost: 0,
    passed: 0,
  };

  for (const entry of await readPipeline()) {
    counts[entry.status] = (counts[entry.status] ?? 0) + 1;
  }

  return counts;
}

export async function upsertTenders(incoming: Tender[]) {
  const prisma = getPrismaClient();
  await persistTenders(prisma, incoming, { deleteMissing: false });
}

export async function readCronRun(): Promise<CronRunRecord | null> {
  const prisma = getPrismaClient();
  try {
    const run = await prisma.cronRunState.findUnique({
      where: { key: "daily-cron" },
    });

    return run ? mapCronRun(run) : null;
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      (error.code === "P2021" || error.code === "P2022")
    ) {
      return null;
    }

    throw error;
  }
}

export async function writeCronRun(run: CronRunRecord) {
  const prisma = getPrismaClient();
  await prisma.cronRunState.upsert({
    where: { key: run.key },
    create: {
      key: run.key,
      runId: run.runId,
      status: run.status,
      startedAt: new Date(run.startedAt),
      finishedAt: run.finishedAt ? new Date(run.finishedAt) : null,
      failedAt: run.failedAt ? new Date(run.failedAt) : null,
      durationMs: run.durationMs,
      totalExtracted: run.totalExtracted,
      aiScoringRan: run.aiScoringRan,
      activeSearches: run.activeSearches,
      digestMode: run.digestMode,
      digestDelivered: run.digestDelivered,
      digestItemCount: run.digestItemCount,
      error: run.error,
      stopReason: run.stopReason,
      sourceMetrics: run.sourceMetrics as Prisma.InputJsonValue,
      sourceCheckpoints: run.sourceCheckpoints as Prisma.InputJsonValue,
      timings: toNullableJsonInput(run.timings as Prisma.InputJsonValue | null),
    },
    update: {
      runId: run.runId,
      status: run.status,
      startedAt: new Date(run.startedAt),
      finishedAt: run.finishedAt ? new Date(run.finishedAt) : null,
      failedAt: run.failedAt ? new Date(run.failedAt) : null,
      durationMs: run.durationMs,
      totalExtracted: run.totalExtracted,
      aiScoringRan: run.aiScoringRan,
      activeSearches: run.activeSearches,
      digestMode: run.digestMode,
      digestDelivered: run.digestDelivered,
      digestItemCount: run.digestItemCount,
      error: run.error,
      stopReason: run.stopReason,
      sourceMetrics: run.sourceMetrics as Prisma.InputJsonValue,
      sourceCheckpoints: run.sourceCheckpoints as Prisma.InputJsonValue,
      timings: toNullableJsonInput(run.timings as Prisma.InputJsonValue | null),
    },
  });
}
