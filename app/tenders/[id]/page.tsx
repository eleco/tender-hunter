import Link from "next/link";
import { notFound } from "next/navigation";
import { getTenderDetail } from "@/lib/repository";
import {
  countryFlag,
  deadlineUrgency,
  formatCurrency,
  formatDate,
  getScoreClass,
} from "@/lib/format";
import { extractTenderScopes } from "@/lib/lots";
import { getOpportunityCategory, getOpportunityCategoryLabel } from "@/lib/opportunity-category";
import { scoreTenderForSME } from "@/lib/scoring";
import { removePipelineEntry, updatePipelineStatus } from "./actions";
import type { PipelineStatus } from "@/lib/types";

type Props = {
  params: Promise<{ id: string }>;
};

const PIPELINE_STAGES: { status: PipelineStatus; label: string; description: string }[] = [
  { status: "watching", label: "Watching", description: "Monitoring this opportunity" },
  { status: "drafting", label: "Drafting", description: "Preparing a bid response" },
  { status: "submitted", label: "Submitted", description: "Bid has been submitted" },
  { status: "won", label: "Won", description: "Contract awarded to us" },
  { status: "lost", label: "Lost", description: "Contract awarded to another bidder" },
  { status: "passed", label: "Passed", description: "Decided not to pursue" },
];

const STATUS_COLORS: Record<PipelineStatus, string> = {
  watching: "var(--blue)",
  drafting: "var(--orange)",
  submitted: "var(--accent)",
  won: "var(--green)",
  lost: "var(--red)",
  passed: "var(--ink-faint)",
};

export default async function TenderDetailPage({ params }: Props) {
  const { id } = await params;
  const tender = await getTenderDetail(id);

  if (!tender) {
    notFound();
  }

  const pipeline = tender.pipeline;
  const currentStatus = pipeline?.status;
  const urgency = deadlineUrgency(tender.deadlineAt);
  const opportunityCategory = getOpportunityCategory(tender);
  const smeFit = scoreTenderForSME(tender);
  const rankedLots = extractTenderScopes(tender)
    .filter((scope) => scope.kind === "lot")
    .map((scope) => ({
      scope,
      fit: scoreTenderForSME(tender, scope),
    }))
    .sort((a, b) => b.fit.score - a.fit.score);

  return (
    <main className="page-shell">
      <Link href="/dashboard" className="back-link">
        ← Back to dashboard
      </Link>

      <section className="detail-layout">
        <div className="detail-main">
          <div className="card card-strong section-stack highlight-panel">
            <div className="status-band">
              <span className="badge">
                {countryFlag(tender.country ?? "")} {tender.country || "EU"}
              </span>
              <span className="tag">
                {tender.lifecycleStatus === "archived" ? "Archived" : "Live"}
              </span>
              <span className={`tag category-tag category-${opportunityCategory}`}>
                {getOpportunityCategoryLabel(opportunityCategory)}
              </span>
              {tender.procedureType && <span className="tag">{tender.procedureType}</span>}
              {currentStatus && (
                <span
                  className="tag"
                  style={{
                    color: STATUS_COLORS[currentStatus],
                    borderColor: `color-mix(in srgb, ${STATUS_COLORS[currentStatus]} 30%, white)`,
                  }}
                >
                  {PIPELINE_STAGES.find((item) => item.status === currentStatus)?.label}
                </span>
              )}
            </div>

            <div className="stack-sm">
              <div className="section-label">Tender</div>
              <h1 className="title-lg">{tender.title}</h1>
              <p className="lede" style={{ margin: 0 }}>
                <Link href={`/dashboard?buyer=${encodeURIComponent(tender.buyerName)}`}>
                  {tender.buyerName}
                </Link>
              </p>
            </div>

            <div className="action-row">
              <a href={tender.sourceUrl} target="_blank" className="button">
                Open source notice
              </a>
              <span className="insight-pill">Published {formatDate(tender.publishedAt)}</span>
            </div>

            <div className="info-grid">
              <div className="info-tile">
                <div className="section-label">Estimated value</div>
                <div className="kpi-sm" style={{ marginTop: 10 }}>
                  {formatCurrency(tender.estimatedValue, tender.currency)}
                </div>
              </div>
              <div className="info-tile">
                <div className="section-label">Deadline</div>
                <div style={{ marginTop: 10, fontSize: "1.1rem", fontWeight: 800 }}>
                  <span className={urgency?.cssClass === "deadline-expired" ? "deadline-expired" : undefined}>
                    {formatDate(tender.deadlineAt)}
                  </span>
                  {urgency && urgency.cssClass !== "deadline-expired" && (
                    <span className={`deadline-badge ${urgency.cssClass}`}>{urgency.label}</span>
                  )}
                </div>
              </div>
              <div className="info-tile">
                <div className="section-label">Source</div>
                <div className="kpi-sm" style={{ marginTop: 10 }}>
                  {tender.source.toUpperCase()}
                </div>
              </div>
            </div>

            {tender.description && (
              <>
                <hr className="divider" />
                <p className="muted" style={{ margin: 0, fontSize: "0.98rem" }}>
                  {tender.description}
                </p>
              </>
            )}
          </div>

          <div className="card section-stack">
            <div className="toolbar">
              <div>
                <div className="section-label">Pipeline</div>
                <h2 className="title-md">Track the pursuit state</h2>
                <p className="muted" style={{ margin: "6px 0 0" }}>
                  {pipeline
                    ? `Last updated ${formatDate(pipeline.updatedAt)}`
                    : "Pick the current status and keep short notes with it."}
                </p>
              </div>

              {pipeline && (
                <form action={removePipelineEntry}>
                  <input type="hidden" name="tenderId" value={tender.id} />
                  <button type="submit" className="button danger">
                    Remove from pipeline
                  </button>
                </form>
              )}
            </div>

            <form action={updatePipelineStatus} className="stack">
              <input type="hidden" name="tenderId" value={tender.id} />

              <div className="stage-grid">
                {PIPELINE_STAGES.map(({ status, label, description }) => {
                  const isActive = currentStatus === status;

                  return (
                    <button
                      key={status}
                      type="submit"
                      name="status"
                      value={status}
                      title={description}
                      className={`stage-chip${isActive ? " active" : ""}`}
                      style={{
                        color: isActive ? STATUS_COLORS[status] : undefined,
                        borderColor: isActive
                          ? `color-mix(in srgb, ${STATUS_COLORS[status]} 34%, white)`
                          : undefined,
                        background: isActive
                          ? `color-mix(in srgb, ${STATUS_COLORS[status]} 10%, white)`
                          : undefined,
                      }}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>

              <div className="form-group">
                <label htmlFor="notes">Notes</label>
                <input
                  id="notes"
                  type="text"
                  name="notes"
                  defaultValue={pipeline?.notes ?? ""}
                  placeholder="Strong CPV fit, incumbent weak, need partner for security work"
                />
                <div className="field-hint">Optional. The note is saved with the selected status when you click a stage.</div>
              </div>
            </form>
          </div>

          <div className="card section-stack">
            <div className="toolbar">
              <div>
                <div className="section-label">Fit analysis</div>
                <h2 className="title-md">Saved search matches</h2>
              </div>
              <span className="mono" style={{ color: "var(--ink-faint)", fontSize: "0.82rem" }}>
                {tender.matches.length} {tender.matches.length === 1 ? "match" : "matches"}
              </span>
            </div>

            {tender.matches.length === 0 ? (
              <p className="empty-state">This tender is not matched by any saved search right now.</p>
            ) : (
              <div className="stack">
                {tender.matches.map((match) => (
                  <div key={`${match.searchId}-${match.matchedScope?.id ?? "notice"}`} className="card-inset section-stack">
                    <div className="match-summary">
                      <div className="stack-sm">
                        <strong style={{ fontSize: "1rem" }}>{match.searchName}</strong>
                        {match.matchedScope?.kind === "lot" && (
                          <p className="note" style={{ margin: 0 }}>
                            Best lot: {match.matchedScope.title}
                          </p>
                        )}
                        {match.feedbackReasons && match.feedbackReasons.length > 0 && (
                          <p className="note" style={{ margin: 0 }}>
                            {match.feedbackReasons[0]}
                          </p>
                        )}
                        {match.aiReasoning && (
                          <p className="note" style={{ margin: 0 }}>
                            {match.aiReasoning}
                          </p>
                        )}
                      </div>

                      <div className="action-row">
                        <span className={`score-pill ${getScoreClass(match.score)}`}>{match.score}</span>
                        {match.feedbackDelta !== undefined && match.feedbackDelta !== 0 && (
                          <span className="note">
                            Learned {match.feedbackDelta > 0 ? "+" : ""}
                            {match.feedbackDelta}
                          </span>
                        )}
                        {match.aiScore !== undefined && (
                          <span className="ai-score-pill" title={match.aiReasoning}>
                            AI {match.aiScore}
                          </span>
                        )}
                      </div>
                    </div>

                    <ul className="list-tight">
                      {match.matchReasons.map((reason) => (
                        <li key={reason}>{reason}</li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <aside className="detail-side">
          <div className="card section-stack">
            <div className="row-between">
              <div>
                <div className="section-label">SME suitability</div>
                <h2 className="title-md">How realistic is this for a small team?</h2>
              </div>
              <span className={`score-pill ${getScoreClass(smeFit.score)}`}>{smeFit.score}</span>
            </div>

            <ul className="list-tight">
              {smeFit.reasons.slice(0, 3).map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
          </div>

          {rankedLots.length > 0 && (
            <div className="card section-stack">
              <div>
                <div className="section-label">Lots</div>
                <h2 className="title-md">Extracted lot-level view</h2>
              </div>

              <div className="stack">
                {rankedLots.slice(0, 4).map(({ scope, fit }) => (
                  <div key={scope.id} className="card-inset section-stack">
                    <div className="row-between">
                      <strong style={{ fontSize: "0.98rem" }}>{scope.title}</strong>
                      <span className={`score-pill ${getScoreClass(fit.score)}`}>{fit.score}</span>
                    </div>
                    <p className="note" style={{ margin: 0 }}>
                      {fit.reasons[0]}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {tender.feedback && tender.feedback.reasons.length > 0 && (
            <div className="card section-stack">
              <div className="row-between">
                <div>
                  <div className="section-label">Learning loop</div>
                  <h2 className="title-md">How past decisions affect rank</h2>
                </div>
                <span className={`score-pill ${getScoreClass(Math.max(0, 50 + tender.feedback.scoreDelta * 2))}`}>
                  {tender.feedback.scoreDelta > 0 ? "+" : ""}
                  {tender.feedback.scoreDelta}
                </span>
              </div>

              <ul className="list-tight">
                {tender.feedback.reasons.map((reason) => (
                  <li key={reason}>{reason}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="card section-stack">
            <div>
              <div className="section-label">Quick view</div>
              <h2 className="title-md">Should this move forward?</h2>
            </div>

            <ul className="list-plain">
              <li>
                Buyer: <Link href={`/dashboard?buyer=${encodeURIComponent(tender.buyerName)}`}>{tender.buyerName}</Link>
              </li>
              <li>Country: {tender.country || "Not specified"}</li>
              <li>Category: {getOpportunityCategoryLabel(opportunityCategory)}</li>
              <li>Procedure: {tender.procedureType || "Not specified"}</li>
              <li>Published: {formatDate(tender.publishedAt)}</li>
              <li>Lifecycle: {tender.lifecycleStatus === "archived" ? "Archived" : "Live"}</li>
              {tender.archiveReason && <li>Archive reason: {tender.archiveReason}</li>}
            </ul>
          </div>

          {tender.buyerHistory && tender.buyerHistory.archivedCount > 0 && (
            <div className="card section-stack">
              <div>
                <div className="section-label">Buyer history</div>
                <h2 className="title-md">Archived related notices</h2>
              </div>

              <ul className="list-plain">
                <li>{tender.buyerHistory.archivedCount} archived notices from this buyer.</li>
                <li>{tender.buyerHistory.sharedCpvCount} archived notices share CPV overlap with this tender.</li>
              </ul>

              <div className="stack">
                {tender.buyerHistory.recentArchived.map((item) => (
                  <div key={item.id} className="card-inset section-stack">
                    <div className="row-between">
                      <strong style={{ fontSize: "0.98rem" }}>{item.title}</strong>
                      <span className="tag">{formatDate(item.publishedAt)}</span>
                    </div>
                    <p className="note" style={{ margin: 0 }}>
                      {item.archiveReason ?? "Archived historical notice."}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {tender.cpvCodes.length > 0 && (
            <div className="card section-stack">
              <div>
                <div className="section-label">Classification</div>
                <h2 className="title-md">CPV coverage</h2>
              </div>
              <div className="filter-cluster">
                {tender.cpvCodes.map((cpv) => (
                  <span key={cpv} className="tag mono">
                    {cpv}
                  </span>
                ))}
              </div>
            </div>
          )}
        </aside>
      </section>
    </main>
  );
}
