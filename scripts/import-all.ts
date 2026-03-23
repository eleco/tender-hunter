import { runImportJob } from "@/lib/jobs/import-tenders";

async function main() {
  await runImportJob(console);
}

main().catch((error) => {
  console.error("Fatal import error:", error);
  process.exit(1);
});
