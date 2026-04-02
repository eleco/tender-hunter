import { getDashboardSnapshot } from "@/lib/repository";
import { formatDateTime, formatDurationMs } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const snapshot = await getDashboardSnapshot();
  const lastRun = snapshot.lastRun;
  const checkpointEntries = Object.entries(lastRun?.sourceCheckpoints ?? {});

  return (
    <main className="page-shell">
      <section className="panel-grid">
        <div className="card card-strong section-stack highlight-panel">
          <span className="eyebrow">Admin</span>
          <h1 className="title-lg">Scanner operations</h1>
          <p className="lede">
            Runtime budget, source checkpoints, and the latest cron execution state live here.
          </p>

          <div className="insight-strip">
            <span className="insight-pill">{snapshot.totalTenders} total tenders</span>
            <span className="insight-pill">{snapshot.activeTenders} active</span>
            <span className="insight-pill">{snapshot.totalSearches} active searches</span>
          </div>
        </div>
      </section>

      <section className="card section-stack">
        <div>
          <div className="section-label">Latest run</div>
          <h2 className="title-md">Cron status</h2>
        </div>

        {lastRun ? (
          <>
            <div className="country-list">
              <div className="card-inset">
                <div className="section-label">Status</div>
                <div className="kpi-sm">{lastRun.status}</div>
              </div>
              <div className="card-inset">
                <div className="section-label">Started</div>
                <div className="kpi-sm">{formatDateTime(lastRun.startedAt)}</div>
              </div>
              <div className="card-inset">
                <div className="section-label">Duration</div>
                <div className="kpi-sm">{formatDurationMs(lastRun.durationMs)}</div>
              </div>
              <div className="card-inset">
                <div className="section-label">Extracted</div>
                <div className="kpi-sm">{lastRun.totalExtracted ?? 0}</div>
              </div>
            </div>

            <div className="country-list">
              <div className="card-inset">
                <div className="section-label">Fetch</div>
                <div className="kpi-sm">{formatDurationMs(lastRun.timings?.fetchMs ?? null)}</div>
              </div>
              <div className="card-inset">
                <div className="section-label">DB write</div>
                <div className="kpi-sm">{formatDurationMs(lastRun.timings?.dbWriteMs ?? null)}</div>
              </div>
              <div className="card-inset">
                <div className="section-label">AI scoring</div>
                <div className="kpi-sm">{formatDurationMs(lastRun.timings?.aiScoringMs ?? null)}</div>
              </div>
              <div className="card-inset">
                <div className="section-label">Budget left</div>
                <div className="kpi-sm">{formatDurationMs(lastRun.timings?.budgetRemainingMs ?? null)}</div>
              </div>
            </div>

            <div className="country-list">
              <div className="card-inset">
                <div className="section-label">Budget limit</div>
                <div className="kpi-sm">{formatDurationMs(lastRun.timings?.budgetLimitMs ?? null)}</div>
              </div>
              <div className="card-inset">
                <div className="section-label">Digest mode</div>
                <div className="kpi-sm">{lastRun.digestMode ?? "none"}</div>
              </div>
              <div className="card-inset">
                <div className="section-label">Digest delivered</div>
                <div className="kpi-sm">{lastRun.digestDelivered ? "yes" : "no"}</div>
              </div>
              <div className="card-inset">
                <div className="section-label">Digest items</div>
                <div className="kpi-sm">{lastRun.digestItemCount ?? 0}</div>
              </div>
            </div>

            {lastRun.stopReason && (
              <p className="note" style={{ margin: 0 }}>
                Stopped early: {lastRun.stopReason}
              </p>
            )}

            {lastRun.error && (
              <p className="note" style={{ margin: 0 }}>
                Last error: {lastRun.error}
              </p>
            )}
          </>
        ) : (
          <p className="empty-state">No cron run has been recorded yet.</p>
        )}
      </section>

      <section className="grid grid-2">
        <div className="card section-stack">
          <div>
            <div className="section-label">Sources</div>
            <h2 className="title-md">Per-source result</h2>
          </div>

          {lastRun && lastRun.sourceMetrics.length > 0 ? (
            <div className="stack">
              {lastRun.sourceMetrics.map((source) => (
                <div key={source.id} className="card-inset">
                  <strong>{source.name}</strong>
                  <div className="metric-note" style={{ marginTop: 6 }}>
                    {source.count} notices · {formatDurationMs(source.durationMs)} · {source.stoppedEarly ? "partial" : source.ok ? "ok" : source.error ?? "failed"}
                  </div>
                  {source.error && (
                    <div className="note" style={{ marginTop: 8 }}>
                      {source.error}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="empty-state">No source metrics yet.</p>
          )}
        </div>

        <div className="card section-stack">
          <div>
            <div className="section-label">Checkpoints</div>
            <h2 className="title-md">Resume cursors</h2>
          </div>

          {checkpointEntries.length > 0 ? (
            <div className="stack">
              {checkpointEntries.map(([sourceId, checkpoint]) => (
                <div key={sourceId} className="card-inset">
                  <strong>{sourceId}</strong>
                  <div className="metric-note" style={{ marginTop: 6 }}>
                    {formatDateTime(checkpoint)}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="empty-state">No source checkpoints have been recorded yet.</p>
          )}
        </div>
      </section>
    </main>
  );
}
