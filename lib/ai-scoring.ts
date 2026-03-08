import Anthropic from "@anthropic-ai/sdk";
import { buildPipelineFeedbackMap } from "@/lib/pipeline-learning";
import { readAiScores, readPipeline, writeAiScores } from "@/lib/store";
import { SavedSearch, Tender } from "@/lib/types";
import { scoreTender } from "@/lib/scoring";

const CONCURRENCY = 4;

async function scoreOne(
  client: Anthropic,
  search: SavedSearch,
  tender: Tender,
  scopeTitle: string,
  scopeDescription: string,
): Promise<{ score: number; reasoning: string }> {
  const prompt = `You are evaluating whether a public procurement tender is a good fit for a small IT consultancy or even a strong solo senior contractor.

Prioritise, in order:
1. Software development and integration lots under software consultancy CPVs.
2. Cloud review, migration, and bounded application support contracts with limited operational scope.
3. Senior expert, architect, AMO, or advisory lots where the buyer is effectively buying one brain.
4. Subcontracting or smaller lots within larger frameworks in France, Belgium, Luxembourg, or Ireland.

Prefer budgets that feel realistic for an SME.
Penalise broad 24/7 operations, service desk takeovers, large managed services, and oversized contracts that obviously need a large prime supplier.
Remember that EU notices may describe the same scope in English, French, or Spanish.

Search profile:
- Name: ${search.name}
- Required keywords: ${search.keywordsInclude.join(", ") || "any IT services"}
- Excluded keywords: ${search.keywordsExclude.join(", ") || "none"}

Tender:
- Title: ${tender.title}
- Description: ${tender.description}
- Best matching lot or scope: ${scopeTitle}
- Scope detail: ${scopeDescription}
- Country: ${tender.country}
- Estimated value: ${tender.estimatedValue ? `${tender.estimatedValue} ${tender.currency}` : "Not disclosed"}

Rate the fit on a scale of 0–100, where:
- 0–30: poor fit (off-topic, clearly wrong domain)
- 31–60: partial fit (some relevant elements but uncertain)
- 61–80: good fit (clearly relevant to the search)
- 81–100: excellent fit (directly in the consultancy's wheelhouse)

Return ONLY valid JSON: {"score": <number>, "reasoning": "<one concise sentence>"}`;

  const msg = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 120,
    messages: [{ role: "user", content: prompt }],
  });

  const text = msg.content[0].type === "text" ? msg.content[0].text.trim() : "{}";
  try {
    const json = JSON.parse(text.match(/\{[\s\S]*\}/)?.[0] ?? "{}");
    return {
      score: Math.max(0, Math.min(100, Number(json.score) || 0)),
      reasoning: String(json.reasoning || ""),
    };
  } catch {
    return { score: 0, reasoning: "" };
  }
}

/**
 * Scores all keyword matches that don't yet have a cached AI score.
 * Results are persisted to data/ai-scores.json.
 * Key = `${searchId}:${sourceNoticeId}` (stable across re-imports).
 */
export async function scoreNewMatches(
  searches: SavedSearch[],
  tenders: Tender[],
): Promise<void> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.log("  [AI scoring] ANTHROPIC_API_KEY not set — skipping.");
    return;
  }

  const cache = await readAiScores();
  const feedbackByTender = buildPipelineFeedbackMap(tenders, await readPipeline());

  // Find all (search, tender) pairs that pass keyword scoring and lack a cached AI score
  const pending: Array<{ search: SavedSearch; tender: Tender; key: string; scopeTitle: string; scopeDescription: string }> = [];
  for (const search of searches) {
    for (const tender of tenders) {
      const result = scoreTender(search, tender, { feedback: feedbackByTender.get(tender.id) });
      if (!result.isMatch) continue;
      const key = `${search.id}:${tender.sourceNoticeId}:${result.scope.id}`;
      if (!cache[key]) {
        pending.push({
          search,
          tender,
          key,
          scopeTitle: result.scope.title,
          scopeDescription: result.scope.description,
        });
      }
    }
  }

  if (pending.length === 0) {
    console.log("  [AI scoring] All matches already cached — nothing to score.");
    return;
  }

  console.log(`  [AI scoring] Scoring ${pending.length} new matches with Claude Haiku...`);
  const client = new Anthropic({ apiKey });
  let done = 0;

  // Process in batches of CONCURRENCY
  for (let i = 0; i < pending.length; i += CONCURRENCY) {
    const batch = pending.slice(i, i + CONCURRENCY);
    await Promise.all(
      batch.map(async ({ search, tender, key, scopeTitle, scopeDescription }) => {
        try {
          const result = await scoreOne(client, search, tender, scopeTitle, scopeDescription);
          cache[key] = { ...result, cachedAt: new Date().toISOString() };
          done++;
        } catch (err) {
          console.error(`  [AI scoring] Failed for key ${key}:`, err);
        }
      }),
    );
    await writeAiScores(cache); // persist after each batch
    console.log(`  [AI scoring] ${done}/${pending.length} done`);
  }

  console.log(`  [AI scoring] Complete. ${done} scores saved.`);
}
