import { randomUUID } from "node:crypto";
import { Prisma, PipelineStatus as PrismaPipelineStatus, SavedSearch as PrismaSavedSearch, PipelineEntry as PrismaPipelineEntry, Tender as PrismaTender, TenderLifecycleStatus as PrismaTenderLifecycleStatus, TenderScopeKind, TenderCpvCode } from "@prisma/client";
import { getPrismaClient } from "@/lib/db";
import { extractTenderScopes } from "@/lib/lots";
import { AiScoreCache } from "@/lib/store-types";
import { PipelineEntry, PipelineStatus, SavedSearch, Tender, TenderLifecycleStatus } from "@/lib/types";
import { mapWithConcurrency } from "@/lib/async";

const SEARCH_WRITE_CONCURRENCY = 8;

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

function dedupeTendersBySourceNoticeId(tenders: Tender[]) {
  const byNoticeId = new Map<string, Tender>();

  for (const tender of tenders) {
    byNoticeId.set(tender.sourceNoticeId, tender);
  }

  return [...byNoticeId.values()];
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
  const dedupedTenders = dedupeTendersBySourceNoticeId(tenders);
  const keepNoticeIds = dedupedTenders.map((tender) => tender.sourceNoticeId);

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

  for (const tender of dedupedTenders) {
    const input = getTenderWriteInput(tender);
    await prisma.tender.upsert({
      where: { sourceNoticeId: tender.sourceNoticeId },
      create: {
        ...input,
        cpvCodes: {
          create: input.cpvCodes,
        },
        lots: {
          create: input.lots,
        },
      },
      update: {
        ...input,
        cpvCodes: {
          deleteMany: {},
          create: input.cpvCodes,
        },
        lots: {
          deleteMany: {},
          create: input.lots,
        },
      },
    });
  }
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
  const dedupedTenders = dedupeTendersBySourceNoticeId(incoming);

  for (const tender of dedupedTenders) {
    const input = getTenderWriteInput(tender);
    await prisma.tender.upsert({
      where: { sourceNoticeId: tender.sourceNoticeId },
      create: {
        ...input,
        cpvCodes: {
          create: input.cpvCodes,
        },
        lots: {
          create: input.lots,
        },
      },
      update: {
        ...input,
        cpvCodes: {
          deleteMany: {},
          create: input.cpvCodes,
        },
        lots: {
          deleteMany: {},
          create: input.lots,
        },
      },
    });
  }
}
