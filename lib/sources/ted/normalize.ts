import { randomUUID } from "node:crypto";
import { Tender } from "@/lib/types";

// TED API v3 wraps fields in a language-keyed object, e.g.:
//   BT-21-Procedure: { "eng": "Cloud services...", "fra": "..." }
//   organisation-name-buyer: { "eng": ["Agency X"], "fra": ["Agence X"] }
// We pick English first, then fall back to any available language.

function pickText(obj: Record<string, unknown> | string | undefined): string {
  if (!obj) return "";
  if (typeof obj === "string") return obj;
  // Prefer English
  for (const key of ["ENG", "eng"]) {
    const v = (obj as Record<string, unknown>)[key];
    if (typeof v === "string" && v.trim()) return v;
    if (Array.isArray(v) && v.length > 0) return String(v[0]);
  }
  // Fall back to first available language
  for (const v of Object.values(obj as Record<string, unknown>)) {
    if (typeof v === "string" && v.trim()) return v;
    if (Array.isArray(v) && v.length > 0) return String(v[0]);
  }
  return "";
}

function pickArrayText(obj: Record<string, unknown> | string[] | undefined): string {
  if (!obj) return "";
  if (Array.isArray(obj)) return obj[0] ?? "";
  // Language-wrapped: {"est": ["Agency name"]}
  for (const key of ["ENG", "eng"]) {
    const v = (obj as Record<string, unknown>)[key];
    if (Array.isArray(v) && v.length > 0) return String(v[0]);
    if (typeof v === "string" && v.trim()) return v;
  }
  for (const v of Object.values(obj as Record<string, unknown>)) {
    if (Array.isArray(v) && v.length > 0) return String(v[0]);
    if (typeof v === "string" && v.trim()) return v;
  }
  return "";
}

// Convert 3-letter country code (EST, FRA…) to a readable name
const COUNTRY_CODES: Record<string, string> = {
  AUT: "Austria", BEL: "Belgium", BGR: "Bulgaria", HRV: "Croatia",
  CYP: "Cyprus", CZE: "Czech Republic", DNK: "Denmark", EST: "Estonia",
  FIN: "Finland", FRA: "France", DEU: "Germany", GRC: "Greece",
  HUN: "Hungary", IRL: "Ireland", ITA: "Italy", LVA: "Latvia",
  LTU: "Lithuania", LUX: "Luxembourg", MLT: "Malta", NLD: "Netherlands",
  POL: "Poland", PRT: "Portugal", ROU: "Romania", SVK: "Slovakia",
  SVN: "Slovenia", ESP: "Spain", SWE: "Sweden",
  NOR: "Norway", CHE: "Switzerland", ISL: "Iceland",
  GBR: "United Kingdom", USA: "United States",
};

function resolveCountry(raw: unknown): string {
  if (!raw) return "Unknown";
  let code: string | undefined;
  if (Array.isArray(raw)) code = String(raw[0]);
  else if (typeof raw === "string") code = raw;
  if (!code) return "Unknown";
  return COUNTRY_CODES[code.toUpperCase()] || code;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseTedDate(raw: string): string {
  // TED returns dates like "2023-08-17Z" or "2026-03-24+01:00"
  const cleaned = raw.replace(/Z$/, "").replace(/[+-]\d{2}:\d{2}$/, "");
  const d = new Date(cleaned);
  if (isNaN(d.getTime())) return new Date().toISOString();
  return d.toISOString();
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function normalizeTedNotice(raw: any): Tender | null {
  if (!raw || typeof raw !== "object") return null;

  const noticeId: string = raw["publication-number"] ?? "";
  const title = pickText(raw["BT-21-Procedure"]);
  const description =
    pickText(raw["BT-24-Procedure"]) ||
    pickText(raw["description-glo"]);
  const buyerName = pickArrayText(raw["organisation-name-buyer"]);

  if (!title || !buyerName || !noticeId) return null;

  const country = resolveCountry(raw["organisation-country-buyer"]);

  // Deadline: take the earliest date in the array
  const rawDeadlines: string[] = raw["deadline-receipt-tender-date-lot"] ?? [];
  const deadlineAt = rawDeadlines.length > 0
    ? parseTedDate(rawDeadlines.sort()[0])
    : null;

  const publishedAt = raw["publication-date"]
    ? parseTedDate(String(raw["publication-date"]))
    : new Date().toISOString();

  // Estimated value: prefer per-lot estimate, fall back to framework maximum
  const lotValues: number[] = raw["estimated-value-lot"] ?? [];
  const frameworkValues: number[] = raw["framework-maximum-value-lot"] ?? [];
  const rawValues = lotValues.length > 0 ? lotValues : frameworkValues;
  const estimatedValue = rawValues.length > 0 ? Math.max(...rawValues) : null;

  const currency = Array.isArray(raw["BT-711-LotResult-Currency"])
    ? raw["BT-711-LotResult-Currency"][0] || "EUR"
    : "EUR";

  const links = raw["links"]?.["html"] ?? {};
  const sourceUrl =
    links["ENG"] || links["eng"] ||
    `https://ted.europa.eu/en/notice/-/detail/${noticeId}`;

  return {
    id: randomUUID(),
    source: "ted",
    sourceNoticeId: noticeId,
    sourceUrl,
    title,
    description: description || "No description available.",
    buyerName,
    country,
    region: undefined,
    currency,
    estimatedValue,
    publishedAt,
    deadlineAt,
    status: "published",
    procedureType: undefined,
    cpvCodes: [],
    lifecycleStatus: "active",
    archivedAt: null,
    archiveReason: null,
  };
}
