import * as fileStore from "@/lib/store-file";
import * as dbStore from "@/lib/store-db";

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL must be set before migrating flat-file data.");
  }

  console.log("Reading flat-file data...");
  const [tenders, searches, aiScores, pipeline] = await Promise.all([
    fileStore.readTenders(),
    fileStore.readSearches(),
    fileStore.readAiScores(),
    fileStore.readPipeline(),
  ]);

  console.log(`Migrating ${tenders.length} tenders...`);
  await dbStore.writeTenders(tenders);

  console.log(`Migrating ${searches.length} saved searches...`);
  await dbStore.writeSearches(searches);

  console.log(`Migrating ${pipeline.length} pipeline entries...`);
  await dbStore.writePipeline(pipeline);

  console.log(`Migrating ${Object.keys(aiScores).length} AI scores...`);
  await dbStore.writeAiScores(aiScores);

  console.log("Flat-file migration complete.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
