// Find a Tender (UK)
// The UK's official procurement portal, replacing TED post-Brexit.
// Implements OCDS (Open Contracting Data Standard) v1.1.
// Free JSON API — no authentication required.
// Docs: https://www.find-tender.service.gov.uk/api/1.0/description

export type OcdsValue = {
  amount?: number;
  currency?: string;
};

export type OcdsClassification = {
  scheme?: string; // "CPV" for CPV codes
  id?: string;
  description?: string;
};

export type OcdsItem = {
  classification?: OcdsClassification;
};

export type OcdsTender = {
  id?: string;
  title?: string;
  description?: string;
  status?: string;
  tenderPeriod?: { endDate?: string };
  value?: OcdsValue;
  items?: OcdsItem[];
  procurementMethod?: string;
  procurementMethodDetails?: string;
};

export type OcdsParty = {
  id?: string;
  name?: string;
  roles?: string[];
  address?: {
    region?: string;
    countryName?: string;
  };
};

export type OcdsRelease = {
  ocid?: string;
  id?: string;
  date?: string;
  tender?: OcdsTender;
  parties?: OcdsParty[];
  links?: { self?: string };
};

export type FindTenderResponse = {
  releases?: OcdsRelease[];
  nextLink?: string;
};

const FIND_TENDER_API = "https://www.find-tender.service.gov.uk/api/1.0/ocdsReleasePackages";

/** Fetch the first page of OCDS release packages updated since `updatedFrom`. */
export async function searchFindTenderNotices(
  updatedFrom: string,
  limit = 100,
): Promise<FindTenderResponse> {
  const params = new URLSearchParams({ updatedFrom, limit: String(limit) });

  const response = await fetch(`${FIND_TENDER_API}?${params}`, {
    headers: { accept: "application/json" },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Find a Tender fetch failed (${response.status}): ${await response.text()}`);
  }

  return response.json() as Promise<FindTenderResponse>;
}

/** Fetch a subsequent page by following the nextLink URL returned by the API. */
export async function fetchFindTenderNextPage(nextLink: string): Promise<FindTenderResponse> {
  const response = await fetch(nextLink, {
    headers: { accept: "application/json" },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Find a Tender next-page fetch failed (${response.status}): ${await response.text()}`);
  }

  return response.json() as Promise<FindTenderResponse>;
}
