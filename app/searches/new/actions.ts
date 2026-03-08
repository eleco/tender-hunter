"use server";

import { redirect } from "next/navigation";
import { upsertSavedSearch, deleteSavedSearch, setSavedSearchEnabled } from "@/lib/repository";
import { parseCsvList } from "@/lib/format";

export async function createSearch(formData: FormData) {
  const name = String(formData.get("name") || "").trim();
  const countries = parseCsvList(String(formData.get("countries") || ""));
  const keywordsInclude = parseCsvList(String(formData.get("keywordsInclude") || ""));
  const keywordsExclude = parseCsvList(String(formData.get("keywordsExclude") || ""));
  const cpvInclude = parseCsvList(String(formData.get("cpvInclude") || ""));
  const minValue = Number(formData.get("minValue") || 0) || 0;
  const maxDaysToDeadline = Number(formData.get("maxDaysToDeadline") || 30) || 30;
  const minScore = Number(formData.get("minScore") || 45) || 45;

  if (!name || keywordsInclude.length === 0) {
    throw new Error("Search name and at least one included keyword are required.");
  }

  await upsertSavedSearch({
    name,
    enabled: true,
    countries,
    keywordsInclude,
    keywordsExclude,
    cpvInclude,
    minValue,
    maxDaysToDeadline,
    minScore,
    userEmail: "demo@tenderhunter.dev",
  });

  redirect("/dashboard");
}

export async function deleteSearch(formData: FormData) {
  const id = String(formData.get("id") || "").trim();
  if (!id) return;
  await deleteSavedSearch(id);
  redirect("/dashboard");
}

export async function toggleSearchEnabled(formData: FormData) {
  const id = String(formData.get("id") || "").trim();
  const enabled = String(formData.get("enabled") || "").trim() === "true";
  if (!id) return;
  await setSavedSearchEnabled(id, enabled);
  redirect("/dashboard");
}
