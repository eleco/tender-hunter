import { randomUUID } from "node:crypto";
import { Tender } from "@/lib/types";
import { BaseAnuncio } from "./client";

function parseValue(raw: number | undefined): number | null {
  if (raw === undefined || raw === null) return null;
  return Number.isFinite(raw) && raw > 0 ? raw : null;
}

export function normalizeBaseAnuncio(raw: BaseAnuncio): Tender | null {
  const noticeId = raw.id != null ? String(raw.id) : null;
  const title = raw.description?.trim();
  const buyerName = raw.contractingAuthority?.trim();

  if (!noticeId || !title || !buyerName) return null;

  const publishedAt = raw.publicationDate
    ? new Date(raw.publicationDate).toISOString()
    : new Date().toISOString();

  const rawDeadline = raw.closeDate || raw.deadline;
  const deadlineAt = rawDeadline ? new Date(rawDeadline).toISOString() : null;

  const estimatedValue = parseValue(raw.basePrice) ?? parseValue(raw.price);

  return {
    id: randomUUID(),
    source: "base",
    sourceNoticeId: noticeId,
    sourceUrl:
      raw.announcementLink ||
      `https://www.base.gov.pt/Base4/pt/detalhe/?type=anuncio&id=${noticeId}`,
    title,
    description: title, // BASE rarely includes a separate free-text description
    buyerName,
    country: "Portugal",
    region: undefined,
    currency: "EUR",
    estimatedValue,
    publishedAt,
    deadlineAt,
    status: "published",
    procedureType: undefined,
    cpvCodes: Array.isArray(raw.cpvs) ? raw.cpvs.filter(Boolean) : [],
    lifecycleStatus: "active",
    archivedAt: null,
    archiveReason: null,
  };
}
