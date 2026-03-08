// BASE.gov.pt — Portuguese Public Contracts Database
// Covers all Portuguese public procurement including below EU threshold.
// Free AJAX/JSON API — no authentication required.
// Portal: https://www.base.gov.pt/Base4/pt/pesquisa/?type=anuncio

export type BaseAnuncio = {
  id?: number | string;
  description?: string;          // tender title/subject
  contractingAuthority?: string; // buyer name
  cpvs?: string[];               // CPV code array
  publicationDate?: string;      // ISO date string
  closeDate?: string;            // deadline (preferred field)
  deadline?: string;             // deadline (fallback)
  basePrice?: number;            // estimated value
  price?: number;                // estimated value (fallback)
  announcementLink?: string;     // canonical URL
};

export type BaseResponse = {
  items?: BaseAnuncio[];
  total?: number;
};

const BASE_API = "https://www.base.gov.pt/Base4/pt/resultados/";

/** Fetch active procurement announcements from BASE.gov.pt. */
export async function searchBaseNotices(page = 0, pageSize = 100): Promise<BaseResponse> {
  const params = new URLSearchParams({
    type: "anuncio",
    pageSize: String(pageSize),
    page: String(page),
  });

  const response = await fetch(`${BASE_API}?${params}`, {
    headers: {
      accept: "application/json, text/javascript, */*",
      "accept-language": "pt-PT,pt;q=0.9,en;q=0.8",
      "user-agent": "Mozilla/5.0 (compatible; TenderHunter/1.0)",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`BASE.gov.pt fetch failed (${response.status}): ${await response.text()}`);
  }

  return response.json() as Promise<BaseResponse>;
}
