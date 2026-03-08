import assert from "node:assert/strict";
import test from "node:test";
import { demoSearches, demoTenders } from "@/lib/demo-data";
import { buildPipelineFeedbackMap } from "@/lib/pipeline-learning";
import { scoreTender, scoreTenderForSME } from "@/lib/scoring";
import type { PipelineEntry, Tender } from "@/lib/types";

test("software tender scores highly for software search", () => {
  const result = scoreTender(demoSearches[0], demoTenders[0]);
  assert.equal(result.isMatch, true);
  assert.ok(result.score >= 70);
});

test("furniture tender is rejected by software search", () => {
  const result = scoreTender(demoSearches[0], demoTenders[2]);
  assert.equal(result.isMatch, false);
  assert.ok(result.score < demoSearches[0].minScore);
});

test("SME heuristic prefers bounded software and cloud work over large operational security services", () => {
  const softwareFit = scoreTenderForSME(demoTenders[0]);
  const securityFit = scoreTenderForSME(demoTenders[1]);

  assert.ok(softwareFit.score > securityFit.score);
  assert.ok(softwareFit.score >= 70);
});

test("SME heuristic rewards expert advisory lots that can map to one senior brain", () => {
  const advisoryTender: Tender = {
    id: "advisory-1",
    source: "boamp",
    sourceNoticeId: "advisory-1",
    sourceUrl: "https://example.com/advisory-1",
    title: "Senior enterprise architect and AMO support for cloud migration roadmap",
    description:
      "Assistance a maitrise d'ouvrage, architecture review, migration roadmap, and expert advisory support for a public buyer.",
    buyerName: "Example Buyer",
    country: "France",
    currency: "EUR",
    estimatedValue: 95000,
    publishedAt: "2026-02-01T09:00:00.000Z",
    deadlineAt: "2099-03-30T17:00:00.000Z",
    status: "published",
    procedureType: "MAPA",
    cpvCodes: ["72224000", "72222300"],
    lifecycleStatus: "active",
    archivedAt: null,
    archiveReason: null,
  };

  const result = scoreTenderForSME(advisoryTender);
  assert.ok(result.score >= 75);
});

test("SME heuristic penalises oversized managed-service style contracts", () => {
  const heavyOpsTender: Tender = {
    id: "ops-1",
    source: "ted",
    sourceNoticeId: "ops-1",
    sourceUrl: "https://example.com/ops-1",
    title: "Managed services, 24/7 service desk and infrastructure operations",
    description:
      "24/7 managed services, L1/L2 support, on-site team, service transition, call centre activities and continuous operations for a national agency.",
    buyerName: "Example Buyer",
    country: "Ireland",
    currency: "EUR",
    estimatedValue: 2800000,
    publishedAt: "2026-02-01T09:00:00.000Z",
    deadlineAt: "2099-04-30T17:00:00.000Z",
    status: "published",
    procedureType: "Open procedure",
    cpvCodes: ["72000000", "72500000"],
    lifecycleStatus: "active",
    archivedAt: null,
    archiveReason: null,
  };

  const result = scoreTenderForSME(heavyOpsTender);
  assert.ok(result.score <= 45);
});

test("included keywords match translated French and Spanish tender wording", () => {
  const translatedTender: Tender = {
    id: "translated-1",
    source: "boamp",
    sourceNoticeId: "translated-1",
    sourceUrl: "https://example.com/translated-1",
    title: "Migration cloud et soporte de aplicaciones",
    description:
      "Prestations de developpement logiciel, integracion y mantenimiento applicatif para une plateforme publique.",
    buyerName: "Example Buyer",
    country: "France",
    currency: "EUR",
    estimatedValue: 140000,
    publishedAt: "2026-02-01T09:00:00.000Z",
    deadlineAt: "2099-05-01T17:00:00.000Z",
    status: "published",
    procedureType: "MAPA",
    cpvCodes: ["72000000", "72262000"],
    lifecycleStatus: "active",
    archivedAt: null,
    archiveReason: null,
  };

  const result = scoreTender(
    {
      ...demoSearches[0],
      keywordsInclude: ["cloud migration", "application support", "software development"],
      keywordsExclude: [],
      minScore: 40,
    },
    translatedTender,
  );

  assert.equal(result.isMatch, true);
  assert.ok(result.reasons.some((reason) => reason.includes("translated wording")));
});

test("excluded keywords also catch translated wording", () => {
  const translatedTender: Tender = {
    id: "translated-2",
    source: "ted",
    sourceNoticeId: "translated-2",
    sourceUrl: "https://example.com/translated-2",
    title: "Servicios de mobiliario para oficinas",
    description: "Suministro e instalacion de furniture y almacenamiento.",
    buyerName: "Example Buyer",
    country: "Spain",
    currency: "EUR",
    estimatedValue: 60000,
    publishedAt: "2026-02-01T09:00:00.000Z",
    deadlineAt: "2099-05-01T17:00:00.000Z",
    status: "published",
    procedureType: "Open procedure",
    cpvCodes: ["39130000"],
    lifecycleStatus: "active",
    archivedAt: null,
    archiveReason: null,
  };

  const result = scoreTender(
    {
      ...demoSearches[0],
      keywordsInclude: ["software"],
      keywordsExclude: ["furniture"],
      minScore: 10,
    },
    translatedTender,
  );

  assert.ok(result.score < 10);
});

test("lot-level scoring prefers the relevant lot instead of rejecting the whole notice", () => {
  const mixedLotTender: Tender = {
    id: "lots-1",
    source: "ted",
    sourceNoticeId: "lots-1",
    sourceUrl: "https://example.com/lots-1",
    title: "Framework with multiple lots for public digital services",
    description:
      "Lot 1: Service desk, device rollout and 24/7 support operations. " +
      "Lot 2: Software development, API integration, cloud migration and application support for business systems.",
    buyerName: "Example Buyer",
    country: "France",
    currency: "EUR",
    estimatedValue: 280000,
    publishedAt: "2026-02-01T09:00:00.000Z",
    deadlineAt: "2099-05-01T17:00:00.000Z",
    status: "published",
    procedureType: "Open procedure",
    cpvCodes: ["72000000", "72262000"],
    lifecycleStatus: "active",
    archivedAt: null,
    archiveReason: null,
  };

  const result = scoreTender(demoSearches[0], mixedLotTender);

  assert.equal(result.isMatch, true);
  assert.equal(result.scope.kind, "lot");
  assert.match(result.scope.title, /Lot 2/i);
});

test("pipeline feedback boosts similar tenders to previously pursued work", () => {
  const referenceTender: Tender = {
    id: "pipeline-ref",
    source: "boamp",
    sourceNoticeId: "pipeline-ref",
    sourceUrl: "https://example.com/pipeline-ref",
    title: "Cloud migration and application support for regional systems",
    description: "Software integration, cloud review and support applicatif for a regional buyer.",
    buyerName: "Region Example",
    country: "France",
    currency: "EUR",
    estimatedValue: 150000,
    publishedAt: "2026-02-01T09:00:00.000Z",
    deadlineAt: "2099-05-01T17:00:00.000Z",
    status: "published",
    procedureType: "MAPA",
    cpvCodes: ["72000000", "72262000"],
    lifecycleStatus: "active",
    archivedAt: null,
    archiveReason: null,
  };
  const candidateTender: Tender = {
    ...referenceTender,
    id: "pipeline-candidate",
    sourceNoticeId: "pipeline-candidate",
    sourceUrl: "https://example.com/pipeline-candidate",
    title: "Cloud migration and software integration services",
  };
  const pipelineEntries: PipelineEntry[] = [
    {
      tenderId: referenceTender.id,
      status: "submitted",
      updatedAt: "2026-03-01T09:00:00.000Z",
    },
  ];

  const feedbackMap = buildPipelineFeedbackMap(
    [referenceTender, candidateTender],
    pipelineEntries,
  );
  const withoutFeedback = scoreTender(demoSearches[0], candidateTender);
  const withFeedback = scoreTender(demoSearches[0], candidateTender, {
    feedback: feedbackMap.get(candidateTender.id),
  });

  assert.ok((feedbackMap.get(candidateTender.id)?.scoreDelta ?? 0) > 0);
  assert.ok((withFeedback.feedbackDelta ?? 0) > 0);
  assert.ok(withFeedback.score >= withoutFeedback.score);
  assert.ok(withFeedback.reasons.some((reason) => reason.includes("Pipeline learning")));
});
