import { Tender, TenderScope } from "@/lib/types";

const LOT_HEADING_REGEX =
  /(^|[\n\r]|[.;:])\s*((?:lot|lote)\s*(?:n(?:[oº°]|r)?\s*)?(?:\d+|[ivxlcdm]+)\b[^\n]{0,120})/gim;

function compactWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function truncateTitle(value: string, maxLength: number = 120) {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength - 1).trimEnd()}…`;
}

function createNoticeScope(tender: Tender): TenderScope {
  return {
    id: `${tender.id}:notice`,
    kind: "notice",
    title: tender.title,
    description: compactWhitespace(tender.description || tender.title),
  };
}

export function extractTenderScopes(tender: Tender): TenderScope[] {
  const noticeScope = createNoticeScope(tender);
  const description = tender.description?.replace(/\r/g, "\n") ?? "";

  if (!description) {
    return [noticeScope];
  }

  const headers: Array<{ heading: string; start: number }> = [];
  for (const match of description.matchAll(LOT_HEADING_REGEX)) {
    const fullMatch = match[0] ?? "";
    const heading = compactWhitespace(match[2] ?? "");
    const headingOffset = fullMatch.lastIndexOf(heading);
    const start = (match.index ?? 0) + Math.max(headingOffset, 0);

    if (!heading || headers.some((item) => item.start === start)) {
      continue;
    }

    headers.push({ heading, start });
  }

  if (headers.length === 0) {
    return [noticeScope];
  }

  const lots = headers
    .map((header, index) => {
      const end = headers[index + 1]?.start ?? description.length;
      const block = compactWhitespace(description.slice(header.start, end));

      if (block.length < 24) {
        return null;
      }

      const firstLine = compactWhitespace(block.split(/\n+/)[0] ?? block);
      const title = truncateTitle(firstLine || header.heading);

      return {
        id: `${tender.id}:lot:${index + 1}`,
        kind: "lot" as const,
        title,
        description: block,
      };
    })
    .filter((lot): lot is Exclude<typeof lot, null> => Boolean(lot));

  if (lots.length === 0) {
    return [noticeScope];
  }

  return [noticeScope, ...lots];
}
