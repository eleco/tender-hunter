"use server";

import { redirect } from "next/navigation";
import { setPipelineStatus } from "@/lib/store";
import { PipelineStatus } from "@/lib/types";

const VALID_STATUSES: PipelineStatus[] = ["watching", "drafting", "submitted", "won", "lost", "passed"];

export async function updatePipelineStatus(formData: FormData) {
  const tenderId = String(formData.get("tenderId") || "").trim();
  const status = String(formData.get("status") || "").trim() as PipelineStatus;
  const notes = String(formData.get("notes") || "").trim() || undefined;

  if (!tenderId || !VALID_STATUSES.includes(status)) return;

  await setPipelineStatus(tenderId, status, notes);
  redirect(`/tenders/${tenderId}`);
}

export async function removePipelineEntry(formData: FormData) {
  const tenderId = String(formData.get("tenderId") || "").trim();
  const { writePipeline, readPipeline } = await import("@/lib/store");
  if (!tenderId) return;
  const pipeline = await readPipeline();
  await writePipeline(pipeline.filter((entry) => entry.tenderId !== tenderId));
  redirect(`/tenders/${tenderId}`);
}
