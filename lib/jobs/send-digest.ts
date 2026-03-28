import { getDashboardData } from "@/lib/repository";
import { config } from "@/lib/config";
import { formatCurrency, formatDate } from "@/lib/format";
import { Tender } from "@/lib/types";
import { JobLogger } from "@/lib/jobs/import-tenders";

export type DigestJobResult = {
  mode: "matches" | "recent-tenders";
  delivered: boolean;
  recipient?: string;
  itemCount: number;
  subject: string;
};

export type DigestRunInfo = {
  totalExtracted: number;
  durationMs: number;
};

function formatDigestDate() {
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "full",
    timeStyle: "short",
    timeZone: "Europe/Madrid",
  }).format(new Date());
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function getTenderUrl(tenderId: string) {
  return `${config.appUrl.replace(/\/$/, "")}/tenders/${tenderId}`;
}

function getWebsiteUrl() {
  return config.appUrl.replace(/\/$/, "");
}

function formatDuration(durationMs: number) {
  const totalSeconds = Math.max(0, Math.round(durationMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
}

function getRunSummaryLines(runInfo?: DigestRunInfo) {
  if (!runInfo) return [];

  return [
    `Extracted this run: ${runInfo.totalExtracted}`,
    `Import duration: ${formatDuration(runInfo.durationMs)}`,
  ];
}

function getRunSummaryRows(runInfo?: DigestRunInfo) {
  if (!runInfo) return "";

  return `
    <tr><td style="padding: 4px 12px 4px 0;"><strong>Extracted this run</strong></td><td>${runInfo.totalExtracted}</td></tr>
    <tr><td style="padding: 4px 12px 4px 0;"><strong>Import duration</strong></td><td>${escapeHtml(formatDuration(runInfo.durationMs))}</td></tr>
  `;
}

function buildImportedTenderDigest(
  data: Awaited<ReturnType<typeof getDashboardData>>,
  tenders: Tender[],
  runInfo?: DigestRunInfo,
) {
  const generatedAt = formatDigestDate();
  const recentTenders = tenders.slice(0, 10);
  const subject = `Tender Hunter daily scanner results: ${recentTenders.length} recent tenders`;
  const summaryLines = [
    "Tender Hunter daily digest",
    `Generated: ${generatedAt}`,
    `Website: ${getWebsiteUrl()}`,
    `Active searches: ${data.activeSearchCount}`,
    `Active tenders: ${data.snapshot.activeTenders}`,
    `Archived tenders: ${data.snapshot.archivedTenders}`,
    ...getRunSummaryLines(runInfo),
    `Recent tenders shown: ${recentTenders.length}`,
    "",
  ];

  const textSections = recentTenders.flatMap((tender, index) => [
    `${index + 1}. ${tender.title}`,
    `Source: ${tender.source}`,
    `Buyer: ${tender.buyerName}`,
    `Country: ${tender.country}`,
    `Published: ${formatDate(tender.publishedAt)}`,
    `Deadline: ${formatDate(tender.deadlineAt)}`,
    `Value: ${formatCurrency(tender.estimatedValue, tender.currency)}`,
    `Link: ${getTenderUrl(tender.id)}`,
    `Source URL: ${tender.sourceUrl}`,
    "",
  ]);

  const emptyStateText = recentTenders.length === 0
    ? ["No tenders were available in this run.", ""]
    : [];

  const text = [...summaryLines, ...emptyStateText, ...textSections].join("\n");

  const htmlItems = recentTenders.length === 0
    ? "<p>No tenders were available in this run.</p>"
    : `<ol>${recentTenders.map((tender) => `
        <li style="margin-bottom: 18px;">
          <div style="font-size: 16px; font-weight: 600; margin-bottom: 6px;">${escapeHtml(tender.title)}</div>
          <div><strong>Source:</strong> ${escapeHtml(tender.source)}</div>
          <div><strong>Buyer:</strong> ${escapeHtml(tender.buyerName)}</div>
          <div><strong>Country:</strong> ${escapeHtml(tender.country)}</div>
          <div><strong>Published:</strong> ${escapeHtml(formatDate(tender.publishedAt))}</div>
          <div><strong>Deadline:</strong> ${escapeHtml(formatDate(tender.deadlineAt))}</div>
          <div><strong>Value:</strong> ${escapeHtml(formatCurrency(tender.estimatedValue, tender.currency))}</div>
          <div style="margin-top: 6px;">
            <a href="${escapeHtml(getTenderUrl(tender.id))}">Open tender</a>
            <span> | </span>
            <a href="${escapeHtml(tender.sourceUrl)}">Source notice</a>
          </div>
        </li>
      `).join("")}</ol>`;

  const html = `
    <html>
      <body style="font-family: Georgia, serif; color: #1c1917; line-height: 1.5;">
        <h1 style="margin-bottom: 8px;">Tender Hunter daily digest</h1>
        <p style="margin-top: 0; color: #57534e;">Generated ${escapeHtml(generatedAt)}</p>
        <p style="margin: 0 0 16px;">
          <a href="${escapeHtml(getWebsiteUrl())}">Open Tender Hunter</a>
        </p>
        <table style="border-collapse: collapse; margin: 18px 0;">
          <tr><td style="padding: 4px 12px 4px 0;"><strong>Active searches</strong></td><td>${data.activeSearchCount}</td></tr>
          <tr><td style="padding: 4px 12px 4px 0;"><strong>Active tenders</strong></td><td>${data.snapshot.activeTenders}</td></tr>
          <tr><td style="padding: 4px 12px 4px 0;"><strong>Archived tenders</strong></td><td>${data.snapshot.archivedTenders}</td></tr>
          ${getRunSummaryRows(runInfo)}
          <tr><td style="padding: 4px 12px 4px 0;"><strong>Recent tenders shown</strong></td><td>${recentTenders.length}</td></tr>
        </table>
        ${htmlItems}
      </body>
    </html>
  `.trim();

  return {
    mode: "recent-tenders" as const,
    itemCount: recentTenders.length,
    subject,
    text,
    html,
  };
}

function buildMatchDigest(data: Awaited<ReturnType<typeof getDashboardData>>, runInfo?: DigestRunInfo) {
  const generatedAt = formatDigestDate();
  const topMatches = data.matches.slice(0, 10);
  const subject = `Tender Hunter daily scanner results: ${topMatches.length} top matches`;
  const summaryLines = [
    "Tender Hunter daily digest",
    `Generated: ${generatedAt}`,
    `Website: ${getWebsiteUrl()}`,
    `Active searches: ${data.activeSearchCount}`,
    `Active tenders: ${data.snapshot.activeTenders}`,
    `Archived tenders: ${data.snapshot.archivedTenders}`,
    ...getRunSummaryLines(runInfo),
    `Strong matches: ${data.snapshot.strongMatches}`,
    `Top matches shown: ${topMatches.length}`,
    "",
  ];

  const textSections = topMatches.flatMap((match, index) => [
    `${index + 1}. ${match.title}`,
    `Buyer: ${match.buyerName}`,
    `Country: ${match.country}`,
    `Score: ${match.score}`,
    `Value: ${formatCurrency(match.estimatedValue, match.currency)}`,
    `Deadline: ${formatDate(match.deadlineAt)}`,
    `Why: ${match.matchReasons.join(" | ")}`,
    `Link: ${getTenderUrl(match.tenderId)}`,
    "",
  ]);

  const emptyStateText = topMatches.length === 0
    ? ["No ranked matches were found in this run.", ""]
    : [];

  const text = [...summaryLines, ...emptyStateText, ...textSections].join("\n");

  const htmlItems = topMatches.length === 0
    ? "<p>No ranked matches were found in this run.</p>"
    : `<ol>${topMatches.map((match) => `
        <li style="margin-bottom: 18px;">
          <div style="font-size: 16px; font-weight: 600; margin-bottom: 6px;">${escapeHtml(match.title)}</div>
          <div><strong>Buyer:</strong> ${escapeHtml(match.buyerName)}</div>
          <div><strong>Country:</strong> ${escapeHtml(match.country)}</div>
          <div><strong>Score:</strong> ${match.score}</div>
          <div><strong>Value:</strong> ${escapeHtml(formatCurrency(match.estimatedValue, match.currency))}</div>
          <div><strong>Deadline:</strong> ${escapeHtml(formatDate(match.deadlineAt))}</div>
          <div><strong>Why:</strong> ${escapeHtml(match.matchReasons.join(" | "))}</div>
          <div style="margin-top: 6px;">
            <a href="${escapeHtml(getTenderUrl(match.tenderId))}">Open tender</a>
          </div>
        </li>
      `).join("")}</ol>`;

  const html = `
    <html>
      <body style="font-family: Georgia, serif; color: #1c1917; line-height: 1.5;">
        <h1 style="margin-bottom: 8px;">Tender Hunter daily digest</h1>
        <p style="margin-top: 0; color: #57534e;">Generated ${escapeHtml(generatedAt)}</p>
        <p style="margin: 0 0 16px;">
          <a href="${escapeHtml(getWebsiteUrl())}">Open Tender Hunter</a>
        </p>
        <table style="border-collapse: collapse; margin: 18px 0;">
          <tr><td style="padding: 4px 12px 4px 0;"><strong>Active searches</strong></td><td>${data.activeSearchCount}</td></tr>
          <tr><td style="padding: 4px 12px 4px 0;"><strong>Active tenders</strong></td><td>${data.snapshot.activeTenders}</td></tr>
          <tr><td style="padding: 4px 12px 4px 0;"><strong>Archived tenders</strong></td><td>${data.snapshot.archivedTenders}</td></tr>
          ${getRunSummaryRows(runInfo)}
          <tr><td style="padding: 4px 12px 4px 0;"><strong>Strong matches</strong></td><td>${data.snapshot.strongMatches}</td></tr>
          <tr><td style="padding: 4px 12px 4px 0;"><strong>Top matches shown</strong></td><td>${topMatches.length}</td></tr>
        </table>
        ${htmlItems}
      </body>
    </html>
  `.trim();

  return {
    mode: "matches" as const,
    itemCount: topMatches.length,
    subject,
    text,
    html,
  };
}

function buildDigest(data: Awaited<ReturnType<typeof getDashboardData>>, runInfo?: DigestRunInfo) {
  if (data.activeSearchCount === 0 && data.allTenders) {
    return buildImportedTenderDigest(data, data.allTenders, runInfo);
  }

  return buildMatchDigest(data, runInfo);
}

async function sendViaMailgun(subject: string, text: string, html: string, logger: JobLogger = console) {
  const mailgunApiKey = process.env.MAILGUN_API_KEY;
  const mailgunDomain = process.env.MAILGUN_DOMAIN;
  const mailgunFrom = process.env.MAILGUN_FROM;
  const digestTo = process.env.DIGEST_TO;
  const configuredValues = [mailgunApiKey, mailgunDomain, mailgunFrom, digestTo].filter(Boolean);

  if (configuredValues.length === 0) {
    logger.log("Mailgun not configured; digest was printed to stdout only.");
    return { delivered: false };
  }

  const missing: string[] = [];
  if (!mailgunApiKey) missing.push("MAILGUN_API_KEY");
  if (!mailgunDomain) missing.push("MAILGUN_DOMAIN");
  if (!mailgunFrom) missing.push("MAILGUN_FROM");
  if (!digestTo) missing.push("DIGEST_TO");

  if (missing.length > 0) {
    throw new Error(`Mailgun is partially configured. Missing: ${missing.join(", ")}`);
  }

  const baseUrl = process.env.MAILGUN_API_BASE_URL || "https://api.mailgun.net";
  const requiredMailgunFrom = mailgunFrom as string;
  const requiredDigestTo = digestTo as string;
  const requiredMailgunApiKey = mailgunApiKey as string;
  const requiredMailgunDomain = mailgunDomain as string;
  const form = new FormData();
  form.set("from", requiredMailgunFrom);
  form.set("to", requiredDigestTo);
  form.set("subject", subject);
  form.set("text", text);
  form.set("html", html);

  const response = await fetch(`${baseUrl}/v3/${requiredMailgunDomain}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`api:${requiredMailgunApiKey}`).toString("base64")}`,
    },
    body: form,
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Mailgun request failed (${response.status} ${response.statusText}): ${body}`);
  }

  logger.log(`Digest email sent to ${requiredDigestTo}.`);
  return {
    delivered: true,
    recipient: requiredDigestTo,
  };
}

export async function runDigestJob(
  logger: JobLogger = console,
  runInfo?: DigestRunInfo,
): Promise<DigestJobResult> {
  const data = await getDashboardData();
  const digest = buildDigest(data, runInfo);

  logger.log(digest.text);
  const delivery = await sendViaMailgun(digest.subject, digest.text, digest.html, logger);

  return {
    mode: digest.mode,
    delivered: delivery.delivered,
    recipient: delivery.recipient,
    itemCount: digest.itemCount,
    subject: digest.subject,
  };
}
