import { getDashboardData } from "@/lib/repository";
import { formatCurrency, formatDate } from "@/lib/format";

async function main() {
  const data = await getDashboardData();

  const lines = [
    "Tender Hunter daily digest",
    "",
    `High-fit matches: ${data.matches.length}`,
    "",
  ];

  for (const match of data.matches.slice(0, 10)) {
    lines.push(`${match.title}`);
    lines.push(`Buyer: ${match.buyerName}`);
    lines.push(`Country: ${match.country}`);
    lines.push(`Score: ${match.score}`);
    lines.push(`Value: ${formatCurrency(match.estimatedValue, match.currency)}`);
    lines.push(`Deadline: ${formatDate(match.deadlineAt)}`);
    lines.push(`Why: ${match.matchReasons.join(" | ")}`);
    lines.push("");
  }

  console.log(lines.join("\n"));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
