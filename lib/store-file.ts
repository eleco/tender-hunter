import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { SavedSearch, Tender, PipelineEntry, PipelineStatus, TenderLifecycleStatus } from "@/lib/types";
import { AiScoreCache, CronRunRecord } from "@/lib/store-types";

const DATA_DIR = path.join(process.cwd(), "data");
const TENDERS_FILE = path.join(DATA_DIR, "tenders.json");
const SEARCHES_FILE = path.join(DATA_DIR, "searches.json");
const AI_SCORES_FILE = path.join(DATA_DIR, "ai-scores.json");
const PIPELINE_FILE = path.join(DATA_DIR, "pipeline.json");
const CRON_RUN_FILE = path.join(DATA_DIR, "cron-run.json");

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function readJson<T>(filePath: string, fallback: T): T {
  ensureDataDir();
  if (!fs.existsSync(filePath)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf-8")) as T;
  } catch {
    return fallback;
  }
}

function writeJson<T>(filePath: string, data: T) {
  ensureDataDir();
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
}

function normalizeSearch(search: SavedSearch | (Omit<SavedSearch, "enabled"> & { enabled?: boolean })): SavedSearch {
  return {
    ...search,
    enabled: search.enabled ?? true,
  };
}

type TenderWithOptionalLifecycle = Omit<Tender, "lifecycleStatus" | "archivedAt" | "archiveReason"> & {
  lifecycleStatus?: TenderLifecycleStatus;
  archivedAt?: string | null;
  archiveReason?: string | null;
};

type TenderLifecycleInfo = {
  lifecycleStatus: TenderLifecycleStatus;
  archivedAt: string | null;
  archiveReason: string | null;
};

function isPastDate(value: string | null | undefined) {
  if (!value) return false;
  return new Date(value).getTime() < Date.now();
}

function resolveArchiveReason(tender: TenderWithOptionalLifecycle): TenderLifecycleInfo {
  const normalizedStatus = `${tender.status ?? ""} ${tender.procedureType ?? ""}`.toLowerCase();

  if (/\b(cancelled|canceled|annul|abandon|withdrawn|without award)\b/.test(normalizedStatus)) {
    return {
      lifecycleStatus: "archived",
      archivedAt: tender.archivedAt ?? new Date().toISOString(),
      archiveReason: tender.archiveReason ?? "Cancelled or discontinued notice.",
    };
  }

  if (/\b(award|awarded|attribu|conclu|closed|terminated|unsuccessful)\b/.test(normalizedStatus)) {
    return {
      lifecycleStatus: "archived",
      archivedAt: tender.archivedAt ?? new Date().toISOString(),
      archiveReason: tender.archiveReason ?? "Notice appears closed or awarded.",
    };
  }

  if (isPastDate(tender.deadlineAt)) {
    return {
      lifecycleStatus: "archived",
      archivedAt: tender.archivedAt ?? tender.deadlineAt ?? new Date().toISOString(),
      archiveReason: tender.archiveReason ?? "Submission deadline has passed.",
    };
  }

  const ageInDays = Math.floor((Date.now() - new Date(tender.publishedAt).getTime()) / 86400000);
  if (!tender.deadlineAt && ageInDays > 180) {
    return {
      lifecycleStatus: "archived",
      archivedAt: tender.archivedAt ?? new Date().toISOString(),
      archiveReason: tender.archiveReason ?? "Notice is stale and has no live deadline.",
    };
  }

  return {
    lifecycleStatus: "active",
    archivedAt: null,
    archiveReason: null,
  };
}

function normalizeTender(tender: Tender | TenderWithOptionalLifecycle): Tender {
  const lifecycle = resolveArchiveReason(tender);
  return {
    ...tender,
    lifecycleStatus: tender.lifecycleStatus ?? lifecycle.lifecycleStatus,
    archivedAt: tender.archivedAt ?? lifecycle.archivedAt,
    archiveReason: tender.archiveReason ?? lifecycle.archiveReason,
  };
}

export async function readTenders(): Promise<Tender[]> {
  const tenders = readJson<Array<Tender | TenderWithOptionalLifecycle>>(TENDERS_FILE, []);
  return tenders.map(normalizeTender);
}

export async function writeTenders(tenders: Tender[]) {
  writeJson(TENDERS_FILE, tenders);
}

export async function readSearches(): Promise<SavedSearch[]> {
  const searches = readJson<Array<SavedSearch | (Omit<SavedSearch, "enabled"> & { enabled?: boolean })>>(SEARCHES_FILE, []);
  return searches.map(normalizeSearch);
}

export async function writeSearches(searches: SavedSearch[]) {
  writeJson(SEARCHES_FILE, searches);
}

export async function upsertSearch(input: Omit<SavedSearch, "id">): Promise<SavedSearch> {
  const searches = await readSearches();
  const newSearch: SavedSearch = normalizeSearch({ id: randomUUID(), ...input });
  await writeSearches([newSearch, ...searches]);
  return newSearch;
}

export async function deleteSearch(id: string): Promise<void> {
  const searches = await readSearches();
  await writeSearches(searches.filter((search) => search.id !== id));
}

export async function setSearchEnabled(id: string, enabled: boolean): Promise<void> {
  const searches = await readSearches();
  await writeSearches(
    searches.map((search) =>
      search.id === id
        ? { ...search, enabled }
        : search,
    ),
  );
}

export async function readAiScores(): Promise<AiScoreCache> {
  return readJson<AiScoreCache>(AI_SCORES_FILE, {});
}

export async function writeAiScores(cache: AiScoreCache) {
  writeJson(AI_SCORES_FILE, cache);
}

export async function readPipeline(): Promise<PipelineEntry[]> {
  return readJson<PipelineEntry[]>(PIPELINE_FILE, []);
}

export async function writePipeline(entries: PipelineEntry[]) {
  writeJson(PIPELINE_FILE, entries);
}

export async function getPipelineEntry(tenderId: string): Promise<PipelineEntry | undefined> {
  return (await readPipeline()).find((entry) => entry.tenderId === tenderId);
}

export async function setPipelineStatus(tenderId: string, status: PipelineStatus, notes?: string) {
  const entries = (await readPipeline()).filter((entry) => entry.tenderId !== tenderId);
  entries.unshift({ tenderId, status, updatedAt: new Date().toISOString(), notes });
  await writePipeline(entries);
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
  const existing = await readTenders();
  const byNoticeId = new Map(existing.map((tender) => [tender.sourceNoticeId, tender]));

  for (const tender of incoming) {
    const normalizedIncoming = normalizeTender(tender);
    const existingTender = byNoticeId.get(tender.sourceNoticeId);
    byNoticeId.set(tender.sourceNoticeId, {
      ...existingTender,
      ...normalizedIncoming,
      lifecycleStatus: normalizedIncoming.lifecycleStatus,
      archivedAt: normalizedIncoming.archivedAt,
      archiveReason: normalizedIncoming.archiveReason,
    });
  }

  await writeTenders(
    [...byNoticeId.values()].sort(
      (a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime(),
    ),
  );
}

export async function readCronRun(): Promise<CronRunRecord | null> {
  return readJson<CronRunRecord | null>(CRON_RUN_FILE, null);
}

export async function writeCronRun(run: CronRunRecord) {
  writeJson(CRON_RUN_FILE, run);
}
