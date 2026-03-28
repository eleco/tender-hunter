import type { PipelineStatus, SavedSearch, Tender } from "@/lib/types";
import * as databaseStore from "@/lib/store-db";
import * as fileStore from "@/lib/store-file";
import type { CronRunRecord } from "@/lib/store-types";

export type { AiScoreEntry, AiScoreCache } from "@/lib/store-types";
export type { CronRunRecord, ImportRunTimings, ImportSourceTiming } from "@/lib/store-types";

export function getStorageBackend() {
  const configured = process.env.STORAGE_BACKEND;

  if (configured === "database" || configured === "file") {
    return configured;
  }

  return process.env.DATABASE_URL ? "database" : "file";
}

function getStore() {
  return getStorageBackend() === "database" ? databaseStore : fileStore;
}

export async function readTenders() {
  return getStore().readTenders();
}

export async function writeTenders(tenders: Tender[]) {
  return getStore().writeTenders(tenders);
}

export async function readSearches() {
  return getStore().readSearches();
}

export async function writeSearches(searches: SavedSearch[]) {
  return getStore().writeSearches(searches);
}

export async function upsertSearch(input: Omit<SavedSearch, "id">) {
  return getStore().upsertSearch(input);
}

export async function deleteSearch(id: string) {
  return getStore().deleteSearch(id);
}

export async function setSearchEnabled(id: string, enabled: boolean) {
  return getStore().setSearchEnabled(id, enabled);
}

export async function readAiScores() {
  return getStore().readAiScores();
}

export async function writeAiScores(cache: Awaited<ReturnType<typeof fileStore.readAiScores>>) {
  return getStore().writeAiScores(cache);
}

export async function readPipeline() {
  return getStore().readPipeline();
}

export async function writePipeline(entries: Awaited<ReturnType<typeof fileStore.readPipeline>>) {
  return getStore().writePipeline(entries);
}

export async function getPipelineEntry(tenderId: string) {
  return getStore().getPipelineEntry(tenderId);
}

export async function setPipelineStatus(tenderId: string, status: PipelineStatus, notes?: string) {
  return getStore().setPipelineStatus(tenderId, status, notes);
}

export async function getPipelineCounts() {
  return getStore().getPipelineCounts();
}

export async function upsertTenders(incoming: Tender[]) {
  return getStore().upsertTenders(incoming);
}

export async function readCronRun() {
  return getStore().readCronRun();
}

export async function writeCronRun(run: CronRunRecord) {
  return getStore().writeCronRun(run);
}
