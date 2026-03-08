import { normalizeKeywordText } from "@/lib/keywords";
import { PipelineEntry, PipelineStatus, PipelineFeedback, Tender } from "@/lib/types";

const STATUS_WEIGHTS: Record<PipelineStatus, number> = {
  watching: 6,
  drafting: 10,
  submitted: 14,
  won: 20,
  lost: -6,
  passed: -16,
};

const STATUS_LABELS: Record<PipelineStatus, string> = {
  watching: "watching",
  drafting: "drafting",
  submitted: "submitted",
  won: "won",
  lost: "lost",
  passed: "passed",
};

const TOKEN_STOP_WORDS = new Set([
  "about", "above", "accord", "accords", "application", "applications", "buyer",
  "cadre", "cloud", "contract", "contracts", "data", "delivery", "development",
  "digital", "framework", "gestion", "implementation", "informatique", "maintenance",
  "marche", "market", "notice", "plateforme", "platform", "prestation", "project",
  "projects", "public", "publique", "services", "software", "solution", "solutions",
  "support", "system", "systems", "tender", "work",
]);

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function normalizeBuyerName(value: string) {
  return normalizeKeywordText(value)
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getIntentTokens(tender: Tender) {
  return new Set(
    normalizeKeywordText(`${tender.title} ${tender.description}`)
      .split(/[^a-z0-9]+/)
      .filter((token) => token.length >= 5 && !TOKEN_STOP_WORDS.has(token)),
  );
}

function getSharedIntentTokens(candidate: Tender, reference: Tender) {
  const candidateTokens = getIntentTokens(candidate);
  const referenceTokens = getIntentTokens(reference);

  return [...candidateTokens]
    .filter((token) => referenceTokens.has(token))
    .slice(0, 3);
}

function getSimilarity(candidate: Tender, reference: Tender) {
  if (candidate.id === reference.id) {
    return {
      score: 1,
      features: ["same tender"],
    };
  }

  let score = 0;
  const features: string[] = [];

  if (normalizeBuyerName(candidate.buyerName) === normalizeBuyerName(reference.buyerName)) {
    score += 0.55;
    features.push("same buyer");
  }

  if (candidate.country && candidate.country === reference.country) {
    score += 0.1;
  }

  const cpvOverlap = candidate.cpvCodes.filter((cpv) => reference.cpvCodes.includes(cpv));
  if (cpvOverlap.length > 0) {
    score += Math.min(0.35, cpvOverlap.length * 0.16);
    features.push(`shared CPV ${cpvOverlap.slice(0, 2).join(", ")}`);
  }

  const sharedTokens = getSharedIntentTokens(candidate, reference);
  if (sharedTokens.length > 0) {
    score += Math.min(0.3, sharedTokens.length * 0.08);
    features.push(`shared scope terms like ${sharedTokens.join(", ")}`);
  }

  return {
    score: Math.min(1, score),
    features,
  };
}

function buildReason(status: PipelineStatus, features: string[]) {
  const featureText = features.length > 0 ? ` (${features.join(", ")})` : "";
  return `Pipeline learning: similar work was marked as ${STATUS_LABELS[status]}${featureText}.`;
}

export function buildPipelineFeedbackMap(
  tenders: Tender[],
  pipelineEntries: PipelineEntry[],
): Map<string, PipelineFeedback> {
  const tenderById = new Map(tenders.map((tender) => [tender.id, tender]));
  const references = pipelineEntries
    .map((entry) => ({ entry, tender: tenderById.get(entry.tenderId) }))
    .filter((item): item is { entry: PipelineEntry; tender: Tender } => Boolean(item.tender));

  const feedbackByTender = new Map<string, PipelineFeedback>();

  for (const candidate of tenders) {
    const contributions: Array<{ delta: number; reason: string }> = [];

    for (const { entry, tender: reference } of references) {
      const similarity = getSimilarity(candidate, reference);
      if (similarity.score < 0.45 && candidate.id !== reference.id) {
        continue;
      }

      const baseWeight = STATUS_WEIGHTS[entry.status];
      const delta = Math.round(baseWeight * similarity.score);
      if (delta === 0) {
        continue;
      }

      contributions.push({
        delta,
        reason: buildReason(entry.status, similarity.features),
      });
    }

    const scoreDelta = clamp(
      contributions.reduce((sum, contribution) => sum + contribution.delta, 0),
      -20,
      20,
    );

    feedbackByTender.set(candidate.id, {
      scoreDelta,
      reasons: contributions
        .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
        .slice(0, 2)
        .map((contribution) => contribution.reason),
    });
  }

  return feedbackByTender;
}
