import { runDigestJob } from "@/lib/jobs/send-digest";

async function main() {
  await runDigestJob(console);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
