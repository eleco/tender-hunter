import { upsertTenders, readTenders, readSearches } from "@/lib/store";
import { TenderSource } from "@/lib/sources/types";
import { TedSource } from "@/lib/sources/ted";
import { BoampSource } from "@/lib/sources/boamp";
import { BaseSource } from "@/lib/sources/base";
import { FindATenderSource } from "@/lib/sources/findatender";
import { scoreNewMatches } from "@/lib/ai-scoring";
import { Tender } from "@/lib/types";

// Register all active tender sources here.
// Each source must implement TenderSource: { id, name, fetchActiveTenders() }
const SOURCES: TenderSource[] = [
  TedSource,         // EU-wide above-threshold  (TED Search API v3, free, no auth)
  BoampSource,       // France all-threshold     (BOAMP Socrata API, free, no auth)
  FindATenderSource, // UK above-threshold       (Find a Tender OCDS API, free, no auth)
  // Disabled — BASE.gov.pt AJAX endpoint blocks server-side requests (returns empty 200).
  // Portugal's above-threshold notices are already covered by TED.
  // BaseSource,
  // Future:
  // AnacSource,     // Italy  — dati.anticorruzione.it (WAF-protected, needs API key)
  // DoffinSource,   // Norway — doffin.no eForms API (EEA, no public JSON API yet)
  // TenderNedSource,// Netherlands — tenderned.nl (no public JSON API yet)
];

async function main() {
  console.log(`Starting multi-source tender import for ${SOURCES.length} sources...\n`);

  let totalImported = 0;
  let allTenders: Tender[] = [];

  for (const source of SOURCES) {
    console.log(`=== Fetching from: ${source.name} ===`);
    try {
      const tenders = await source.fetchActiveTenders();
      allTenders.push(...tenders);
      console.log(`-> ${source.name} returned ${tenders.length} tenders.\n`);
    } catch (error) {
      console.error(`-> [ERROR] Failed to fetch from ${source.name}:`, error);
    }
  }

  if (allTenders.length > 0) {
    console.log(`\nAggregating and upserting ${allTenders.length} total tenders...`);
    await upsertTenders(allTenders);
    totalImported = allTenders.length;
  }

  console.log(`\nImport pipeline complete! Upserted ${totalImported} total notices.`);

  // AI scoring: score any new matches not yet in the cache
  const searches = await readSearches();
  if (searches.length > 0) {
    console.log("\n=== AI Scoring ===");
    await scoreNewMatches(searches, await readTenders());
  }
}

main().catch((error) => {
  console.error("Fatal import error:", error);
  process.exit(1);
});
