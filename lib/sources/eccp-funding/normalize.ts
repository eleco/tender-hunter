import { randomUUID } from "node:crypto";
import { Tender } from "@/lib/types";
import { EccpPage, EccpSitemapEntry } from "./client";

export type EccpOpportunityPage = EccpPage & {
  lastmod: string | null;
};

function decodeHtmlEntities(input: string) {
  return input
    .replaceAll("&nbsp;", " ")
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));
}

function stripTags(input: string) {
  return decodeHtmlEntities(input)
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+\n/g, "\n")
    .replace(/\n\s+/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function extractMatch(input: string, regex: RegExp) {
  const match = input.match(regex);
  return match?.[1]?.trim() ?? null;
}

function extractTitle(html: string) {
  const fieldTitle = extractMatch(html, /<span class="field">([\s\S]*?)<\/span>/i);
  if (fieldTitle) return stripTags(fieldTitle);

  const documentTitle = extractMatch(html, /<title>([\s\S]*?)<\/title>/i);
  return documentTitle
    ? stripTags(documentTitle.replace(/\s*\|\s*European Cluster Collaboration Platform\s*$/i, ""))
    : null;
}

function extractMetaDescription(html: string) {
  const description = extractMatch(html, /<meta name="description" content="([\s\S]*?)"\s*\/?>/i);
  return description ? decodeHtmlEntities(description).trim() : null;
}

function extractBody(html: string) {
  const bodyField = extractMatch(
    html,
    /field--node--body[\s\S]*?<!-- 💡 BEGIN CUSTOM TEMPLATE OUTPUT[\s\S]*?-->\s*([\s\S]*?)<!-- END CUSTOM TEMPLATE OUTPUT/s,
  );
  return bodyField ? stripTags(bodyField) : null;
}

function extractSubmittedBy(html: string) {
  const submittedBy = extractMatch(
    html,
    /Submitted by[\s\S]*?<span[^>]*typeof="schema:Person"[^>]*>([\s\S]*?)<\/span>/i,
  );
  return submittedBy ? stripTags(submittedBy) : null;
}

function extractClusterOrganisation(html: string) {
  const fieldHtml = extractMatch(
    html,
    /field--name-og-audience[\s\S]*?<div class="field__items">([\s\S]*?)<\/div>\s*<\/div>/i,
  );
  if (!fieldHtml) return null;

  const linkMatch = fieldHtml.match(/<a [^>]*>([\s\S]*?)<\/a>/i);
  return linkMatch ? stripTags(linkMatch[1]) : stripTags(fieldHtml);
}

function extractNodeId(html: string, url: string) {
  const nodeId = extractMatch(html, /<article[^>]*data-history-node-id="(\d+)"/i);
  return nodeId ?? url.replace(/^https:\/\/www\.clustercollaboration\.eu\/content\//, "");
}

function normalizeDateText(value: string) {
  return value
    .replace(/\b(\d{1,2})(st|nd|rd|th)\b/gi, "$1")
    .replace(/\b(CET|CEST|UTC)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function parseLooseDate(value: string): string | null {
  const normalized = normalizeDateText(value);
  const monthName = normalized.match(/^([A-Z][a-z]+)\s+(\d{1,2}),?\s+(\d{4})$/);
  if (monthName) {
    const [, monthLabel, day, year] = monthName;
    const monthNames = [
      "january", "february", "march", "april", "may", "june",
      "july", "august", "september", "october", "november", "december",
    ];
    const monthIndex = monthNames.indexOf(monthLabel.toLowerCase());
    if (monthIndex >= 0) {
      return new Date(Date.UTC(Number(year), monthIndex, Number(day))).toISOString();
    }
  }

  const dayMonthName = normalized.match(/^(\d{1,2})\s+([A-Z][a-z]+)\s+(\d{4})$/);
  if (dayMonthName) {
    const [, day, monthLabel, year] = dayMonthName;
    const monthNames = [
      "january", "february", "march", "april", "may", "june",
      "july", "august", "september", "october", "november", "december",
    ];
    const monthIndex = monthNames.indexOf(monthLabel.toLowerCase());
    if (monthIndex >= 0) {
      return new Date(Date.UTC(Number(year), monthIndex, Number(day))).toISOString();
    }
  }

  const slash = normalized.match(/(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})(?:\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?)?/i);
  if (!slash) return null;

  let [, day, month, year, hour, minute, meridiem] = slash;
  let fullYear = Number(year);
  if (fullYear < 100) fullYear += 2000;

  let hours = hour ? Number(hour) : 0;
  if (meridiem?.toLowerCase() === "pm" && hours < 12) hours += 12;
  if (meridiem?.toLowerCase() === "am" && hours === 12) hours = 0;

  const date = new Date(Date.UTC(fullYear, Number(month) - 1, Number(day), hours, minute ? Number(minute) : 0));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function extractDeadlineAt(text: string): string | null {
  const patterns = [
    /(?:applications?\s+(?:are\s+)?(?:open|accepted|accepting)?\s*(?:until|till)|apply\s+by|deadline(?:\s+extended)?(?:\s+to)?|submissions?\s+(?:are\s+)?open\s+until|open\s+until|call\s+closes?\s+on)\s+([A-Z][a-z]+\s+\d{1,2}(?:st|nd|rd|th)?(?:,)?\s+\d{4})/i,
    /(?:applications?\s+(?:are\s+)?(?:open|accepted|accepting)?\s*(?:until|till)|apply\s+by|deadline(?:\s+extended)?(?:\s+to)?|submissions?\s+(?:are\s+)?open\s+until|open\s+until|call\s+closes?\s+on)\s+(\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4}(?:\s+\d{1,2}(?::\d{2})?\s*(?:am|pm)?)?(?:\s*[A-Z]{2,4})?)/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (!match) continue;

    const parsed = parseLooseDate(match[1]);
    if (parsed) return parsed;
  }

  return null;
}

const STRONG_POSITIVE_PATTERNS = [
  /\bopen call\b/i,
  /\bcall for proposals?\b/i,
  /\bcall for applications?\b/i,
  /\bcascade funding\b/i,
  /\bfinancial support\b/i,
  /\binnovation funding\b/i,
  /\bgrants?\b/i,
  /\bfunding\b/i,
  /\bvouchers?\b/i,
  /\bapply\b/i,
  /\bapplications?\b/i,
  /\btenders?\b/i,
];

const NEGATIVE_TITLE_PATTERNS = [
  /\binfo day\b/i,
  /\bwebinar\b/i,
  /\bconference\b/i,
  /\bworkshop\b/i,
  /\bnewsletter\b/i,
  /\bmatchmaking\b/i,
  /\btraining\b/i,
  /\bmission\b/i,
  /\bacademy\b/i,
];

export function looksLikeEccpOpportunity(title: string, text: string, deadlineAt: string | null) {
  const hasPositive = STRONG_POSITIVE_PATTERNS.some((pattern) => pattern.test(title) || pattern.test(text));
  if (!hasPositive) return false;

  const hasNegativeTitle = NEGATIVE_TITLE_PATTERNS.some((pattern) => pattern.test(title));
  if (hasNegativeTitle && !deadlineAt && !/\bgrants?\b|\bfunding\b|\bfinancial support\b/i.test(text)) {
    return false;
  }

  return true;
}

export function normalizeEccpOpportunity(raw: EccpOpportunityPage): Tender | null {
  const title = extractTitle(raw.html);
  if (!title) return null;

  const description = extractMetaDescription(raw.html);
  const body = extractBody(raw.html);
  const text = [description, body].filter(Boolean).join("\n\n").trim();
  const deadlineAt = extractDeadlineAt(text);
  if (!looksLikeEccpOpportunity(title, text, deadlineAt)) return null;

  const publishedAt =
    parseLooseDate(extractMatch(raw.html, /<span class="date">on ([^<]+)<\/span>/i) ?? "") ||
    (raw.lastmod ? new Date(raw.lastmod).toISOString() : new Date().toISOString());

  const buyerName =
    extractClusterOrganisation(raw.html) ||
    extractSubmittedBy(raw.html) ||
    "European Cluster Collaboration Platform";

  return {
    id: randomUUID(),
    source: "eccp-funding",
    sourceNoticeId: extractNodeId(raw.html, raw.url),
    sourceUrl: raw.url,
    title,
    description: text || title,
    buyerName,
    country: "European Union",
    region: undefined,
    currency: "EUR",
    estimatedValue: null,
    publishedAt,
    deadlineAt,
    status: "published",
    procedureType: "funding-opportunity",
    cpvCodes: [],
    lifecycleStatus: "active",
    archivedAt: null,
    archiveReason: null,
  };
}

export function shouldIncludeEccpSitemapEntry(entry: EccpSitemapEntry, cutoff: string | null) {
  if (!entry.lastmod) return false;
  if (!cutoff) return true;

  const entryMs = Date.parse(entry.lastmod);
  const cutoffMs = Date.parse(cutoff);
  if (Number.isNaN(entryMs) || Number.isNaN(cutoffMs)) return false;

  return entryMs >= cutoffMs;
}
