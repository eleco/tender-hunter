import { randomUUID } from "node:crypto";
import { Tender } from "@/lib/types";
import { OcdsRelease } from "./client";

export function normalizeFindTenderRelease(raw: OcdsRelease): Tender | null {
  const noticeId = raw.ocid || raw.id;
  const tender = raw.tender;
  const title = tender?.title?.trim();

  if (!noticeId || !title) return null;

  // Buyer is the party with role "buyer" or "procuringEntity"
  const buyer = raw.parties?.find(
    (p) => p.roles?.includes("buyer") || p.roles?.includes("procuringEntity"),
  );
  const buyerName = buyer?.name?.trim();
  if (!buyerName) return null;

  const publishedAt = raw.date
    ? new Date(raw.date).toISOString()
    : new Date().toISOString();

  const deadlineAt = tender?.tenderPeriod?.endDate
    ? new Date(tender.tenderPeriod.endDate).toISOString()
    : null;

  const estimatedValue =
    typeof tender?.value?.amount === "number" ? tender.value.amount : null;
  const currency = tender?.value?.currency || "GBP";

  // Extract CPV codes from tender items (scheme must be "CPV")
  const cpvCodes = (tender?.items ?? [])
    .filter((item) => item.classification?.scheme === "CPV" && item.classification.id)
    .map((item) => item.classification!.id!);

  // Filter to IT services tenders.
  // Prefer CPV-based check (division 72); fall back to title keyword matching
  // because UK buyers rarely populate CPV codes in their OCDS data.
  // Keywords are checked against the title only to avoid false positives from
  // incidental IT mentions in long descriptions of non-IT projects.
  const hasItCpv = cpvCodes.some((code) => code.startsWith("72"));
  if (!hasItCpv) {
    // Pad with spaces so word-boundary checks work (e.g. " erp " won't match "therapy")
    const paddedTitle = ` ${title.toLowerCase()} `;
    const IT_TITLE_KEYWORDS = [
      "software", " ict ", "digital", "cloud", "cyber", "saas", "paas", "iaas",
      "database", "data centre", "data center", "data warehouse",
      "information technology", "information system", "information services",
      " it service", " it support", " it system", " it solution", " it infrastructure",
      "managed service", "help desk", "helpdesk", "service desk",
      "devops", " erp ", " crm ", " scrum", "agile",
      "system integration", "network management", "network security",
      "cyber security", "cybersecurity",
    ];
    const isIt = IT_TITLE_KEYWORDS.some((kw) => paddedTitle.includes(kw));
    if (!isIt) return null;
  }

  return {
    id: randomUUID(),
    source: "find-a-tender",
    sourceNoticeId: noticeId,
    sourceUrl:
      raw.links?.self ||
      `https://www.find-tender.service.gov.uk/Notice/Contract/${noticeId}`,
    title,
    description: tender?.description?.trim() || title,
    buyerName,
    country: buyer?.address?.countryName || "United Kingdom",
    region: buyer?.address?.region,
    currency,
    estimatedValue,
    publishedAt,
    deadlineAt,
    status: "published",
    procedureType: tender?.procurementMethodDetails || tender?.procurementMethod,
    cpvCodes,
    lifecycleStatus: "active",
    archivedAt: null,
    archiveReason: null,
  };
}
