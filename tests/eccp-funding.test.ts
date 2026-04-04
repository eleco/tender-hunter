import test from "node:test";
import assert from "node:assert/strict";
import { parseEccpSitemap } from "@/lib/sources/eccp-funding/client";
import {
  extractDeadlineAt,
  looksLikeEccpOpportunity,
  normalizeEccpOpportunity,
  shouldIncludeEccpSitemapEntry,
} from "@/lib/sources/eccp-funding/normalize";

test("parseEccpSitemap normalizes content URLs and skips non-content entries", () => {
  const xml = `<?xml version="1.0"?>
    <urlset>
      <url><loc>http://default/content/example-open-call</loc><lastmod>2026-04-04T08:00Z</lastmod></url>
      <url><loc>http://default/news/example</loc><lastmod>2026-04-04T08:00Z</lastmod></url>
    </urlset>`;

  assert.deepEqual(parseEccpSitemap(xml), [
    {
      url: "https://www.clustercollaboration.eu/content/example-open-call",
      lastmod: "2026-04-04T08:00Z",
    },
  ]);
});

test("extractDeadlineAt parses english and slash-style deadlines", () => {
  assert.equal(
    extractDeadlineAt("Applications are now accepting applications until June 7th 2023."),
    "2023-06-07T00:00:00.000Z",
  );
  assert.equal(
    extractDeadlineAt("Deadline extended to 03/07/2023 15 pm CET."),
    "2023-07-03T15:00:00.000Z",
  );
});

test("looksLikeEccpOpportunity filters event-only titles", () => {
  assert.equal(
    looksLikeEccpOpportunity("Programme info day on open calls", "Join the webinar about open calls.", null),
    false,
  );
  assert.equal(
    looksLikeEccpOpportunity("Cascade funding call for SMEs", "Applications are open until June 7th 2023.", "2023-06-07T00:00:00.000Z"),
    true,
  );
});

test("normalizeEccpOpportunity extracts buyer, dates, and description from public pages", () => {
  const html = `
    <html>
      <head>
        <title>AEI Tèxtils launches 660.000 EUR in cascade funding calls to support textile SMEs in building resilience | European Cluster Collaboration Platform</title>
        <meta name="description" content="Cascade funding to support SMEs." />
      </head>
      <body>
        <article data-history-node-id="206740">
          <span class="field">AEI Tèxtils launches 660.000 EUR in cascade funding calls to support textile SMEs in building resilience</span>
          <strong><span class="label">Submitted by </span><span typeof="schema:Person">Josep Casamada</span> <span class="date">on 05 April 2023</span></strong>
          <div class="field field--name-og-audience"><div class="field__items"><a href="/content/textilscat">Tèxtils.CAT</a></div></div>
          <!-- THEME DEBUG -->
          <!-- FILE NAME SUGGESTIONS: field--node--body -->
          field--node--body
          <!-- 💡 BEGIN CUSTOM TEMPLATE OUTPUT -->
          <p>The first call for proposals includes three financial instruments.</p>
          <p>All three instruments are now accepting applications until June 7th 2023.</p>
          <!-- END CUSTOM TEMPLATE OUTPUT -->
        </article>
      </body>
    </html>
  `;

  const tender = normalizeEccpOpportunity({
    url: "https://www.clustercollaboration.eu/content/example-open-call",
    html,
    lastmod: "2023-04-06T10:00Z",
  });

  assert.ok(tender);
  assert.equal(tender?.source, "eccp-funding");
  assert.equal(tender?.sourceNoticeId, "206740");
  assert.equal(tender?.buyerName, "Tèxtils.CAT");
  assert.equal(tender?.publishedAt, "2023-04-05T00:00:00.000Z");
  assert.equal(tender?.deadlineAt, "2023-06-07T00:00:00.000Z");
});

test("shouldIncludeEccpSitemapEntry uses sitemap lastmod cutoff", () => {
  assert.equal(
    shouldIncludeEccpSitemapEntry(
      { url: "https://www.clustercollaboration.eu/content/example-open-call", lastmod: "2026-04-04T08:00Z" },
      "2026-04-04T07:00:00.000Z",
    ),
    true,
  );
  assert.equal(
    shouldIncludeEccpSitemapEntry(
      { url: "https://www.clustercollaboration.eu/content/example-open-call", lastmod: "2026-04-04T06:00Z" },
      "2026-04-04T07:00:00.000Z",
    ),
    false,
  );
});
