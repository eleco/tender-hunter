import { randomUUID } from "node:crypto";
import { Tender } from "@/lib/types";
import { BoampRecord } from "./client";

export function normalizeBoampRecord(raw: BoampRecord): Tender | null {
  const noticeId = raw.idweb?.trim() || raw.id?.trim();
  const title = raw.objet?.trim();
  const buyerName = raw.nomacheteur?.trim();

  if (!noticeId || !title || !buyerName) return null;

  // Extract description from the eForms UBL JSON blob
  let description = title;
  if (raw.donnees) {
    try {
      const d = typeof raw.donnees === "string" ? JSON.parse(raw.donnees) : raw.donnees;
      const proj = d?.EFORMS?.ContractNotice?.["cac:ProcurementProject"];
      const desc = proj?.["cbc:Description"];
      const text = typeof desc === "object" ? desc?.["#text"] : desc;
      if (typeof text === "string" && text.trim()) description = text.trim();
    } catch { /* keep title as fallback */ }
  }

  const publishedAt = raw.dateparution
    ? new Date(raw.dateparution).toISOString()
    : new Date().toISOString();

  const deadlineAt = raw.datelimitereponse
    ? new Date(raw.datelimitereponse).toISOString()
    : null;

  // Use first department code as region indicator
  const region =
    Array.isArray(raw.code_departement) && raw.code_departement.length > 0
      ? `Département ${raw.code_departement[0]}`
      : undefined;

  return {
    id: randomUUID(),
    source: "boamp",
    sourceNoticeId: noticeId,
    sourceUrl: raw.url_avis || `https://www.boamp.fr/avis/detail/${noticeId}`,
    title,
    description,
    buyerName,
    country: "France",
    region,
    currency: "EUR",
    estimatedValue: null, // BOAMP API does not expose estimated value in standard fields
    publishedAt,
    deadlineAt,
    status: "published",
    procedureType: raw.type_procedure || raw.nature,
    cpvCodes: [], // BOAMP uses its own descripteur_code classification, not CPV
    lifecycleStatus: "active",
    archivedAt: null,
    archiveReason: null,
  };
}
