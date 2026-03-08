export const config = {
  appUrl: process.env.APP_URL || "http://localhost:3000",
  tedApiBaseUrl: process.env.TED_API_BASE_URL || "https://api.ted.europa.eu",
  // Override the default TED expert query. If not set, a CPV 72xxxxxxx query is built
  // automatically in the TED source (see lib/sources/ted/client.ts).
  tedQuery: process.env.TED_QUERY || "",
  tedPageSize: Number(process.env.TED_PAGE_SIZE || 50),
  tedLanguage: process.env.TED_LANGUAGE || "en",
  digestFrom: process.env.DIGEST_FROM || "noreply@example.com",
};
