import { config } from "@/lib/config";

// Fields we request from the TED API v3
export const TED_FIELDS = [
  "BT-21-Procedure",            // title (multilingual object)
  "BT-24-Procedure",            // description (multilingual object)
  "organisation-name-buyer",    // buyer name(s)
  "organisation-country-buyer", // buyer country codes (3-letter ISO)
  "deadline-receipt-tender-date-lot", // array of deadline date strings
  "identifier-part",            // procedure identifier
  "publication-date",           // e.g. "2026-03-01Z"
  "description-glo",            // global description fallback
  "estimated-value-lot",        // estimated value per lot (regular notices)
  "framework-maximum-value-lot",// max framework value (framework agreements)
  "BT-711-LotResult-Currency",  // lot result currency
  "BT-1311(d)-Lot",             // Deadline date
];

// All valid CPV codes in the 72xxxxxxx (IT services) division.
// TED Search API v3 requires exact 8-digit codes via "classification-cpv IN (...)".
// Validated against the TED API — codes not in the official EU CPV dictionary are excluded.
// Source: EU CPV 2008 dictionary, Division 72 (IT services: consulting, software, internet, support)
const IT_CPV_CODES: number[] = [
  // Group 72.0 — IT services (root)
  72000000,
  // Group 72.1 — Hardware consultancy
  72100000, 72110000, 72120000, 72130000, 72140000, 72150000,
  // Group 72.2 — Software programming and consultancy
  72200000, 72210000, 72211000, 72212000,
  72220000, 72221000, 72222000, 72222100, 72222200, 72222300,
  72223000, 72224000, 72224100, 72224200, 72225000, 72226000, 72227000, 72228000,
  72230000, 72231000, 72232000,
  72240000, 72241000, 72242000, 72243000, 72244000, 72245000, 72246000,
  72250000, 72251000, 72252000, 72253000, 72253100, 72253200, 72254000, 72254100,
  72260000, 72261000, 72262000, 72263000, 72264000, 72265000, 72266000,
  72267000, 72267100, 72267200, 72268000,
  // Group 72.3 — Data services
  72300000, 72310000, 72311000, 72312000, 72312100, 72312200,
  72313000, 72314000, 72315000, 72315100, 72315200, 72316000,
  72317000, 72318000, 72319000, 72320000, 72321000, 72322000,
  // Group 72.4 — Internet services (72418000, 72419000 not in CPV dictionary)
  72400000, 72410000, 72411000, 72412000, 72413000, 72414000,
  72415000, 72416000, 72417000,
  72420000, 72421000, 72422000,
  // Group 72.5 — Computer-related services
  72500000, 72510000, 72511000, 72512000, 72513000,
  72514000, 72514100, 72514200, 72514300,
  // Group 72.6 — Computer support and consultancy (72612000 not in CPV dictionary)
  72600000, 72610000, 72611000,
  // Group 72.7 — Computer network services
  72700000, 72710000, 72720000,
  // Group 72.8 — Computer audit and testing
  72800000, 72810000, 72820000,
  // Group 72.9 — Computer back-up and conversion
  72900000, 72910000, 72920000,
];

// Default TED expert query — selects all IT services tenders (CPV 72xxxxxxx)
// notice-type: cn-standard = contract notice, cn-desg = design contest, pin-only = prior information
const DEFAULT_TED_QUERY =
  `classification-cpv IN (${IT_CPV_CODES.join(", ")}) AND notice-type IN (cn-standard, cn-desg, pin-only) SORT BY PD DESC`;

export type TedNoticeRaw = {
  "publication-number"?: string;
  "publication-date"?: string;
  "BT-21-Procedure"?: Record<string, string>;
  "BT-24-Procedure"?: Record<string, string>;
  "description-glo"?: Record<string, string>;
  "organisation-name-buyer"?: string[];
  "organisation-country-buyer"?: string[];
  "deadline-receipt-tender-date-lot"?: string[];
  "estimated-value-lot"?: number[];
  "framework-maximum-value-lot"?: number[];
  "BT-711-LotResult-Currency"?: string[];
  "BT-1311(d)-Lot"?: string[];
  "identifier-part"?: string;
  links?: {
    html?: Record<string, string>;
  };
};

export type TedSearchResponse = {
  notices?: TedNoticeRaw[];
  totalNoticeCount?: number;
  totalPages?: number;
  page?: number;
};

export async function searchTedNotices(page = 1, queryOverride?: string): Promise<TedSearchResponse> {
  const endpoint = `${config.tedApiBaseUrl}/v3/notices/search`;
  const baseQuery = queryOverride || config.tedQuery || DEFAULT_TED_QUERY;
  const queryStr = baseQuery.includes("SORT BY")
    ? baseQuery
    : `${baseQuery} SORT BY PD DESC`;

  const payload = {
    query: queryStr,
    page,
    limit: config.tedPageSize,
    fields: TED_FIELDS,
  };

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json",
    },
    body: JSON.stringify(payload),
    cache: "no-store",
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`TED search failed (${response.status}): ${body}`);
  }

  return response.json() as Promise<TedSearchResponse>;
}
