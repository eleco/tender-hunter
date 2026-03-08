import Link from "next/link";
import { getDashboardData } from "@/lib/repository";
import { toggleSearchEnabled } from "@/app/searches/new/actions";
import {
  countryFlag,
  deadlineUrgency,
  formatCurrency,
  formatDate,
  getScoreClass,
} from "@/lib/format";

type SearchParams = Promise<{
  page?: string;
  country?: string;
  keyword?: string;
  view?: "active" | "archived" | "all";
  sort?: string;
  dir?: string;
}>;

type Props = {
  searchParams: SearchParams;
};

const RESULTS_SECTION_ID = "dashboard-results";

const PIPELINE_STAGES = [
  { key: "watching", label: "Watching", color: "var(--blue)" },
  { key: "drafting", label: "Drafting", color: "var(--orange)" },
  { key: "submitted", label: "Submitted", color: "var(--accent)" },
  { key: "won", label: "Won", color: "var(--green)" },
  { key: "lost", label: "Lost", color: "var(--red)" },
  { key: "passed", label: "Passed", color: "var(--ink-faint)" },
] as const;

function DeadlineCell({ deadlineAt }: { deadlineAt: string | null }) {
  const urgency = deadlineUrgency(deadlineAt);

  return (
    <td className="muted">
      <span className={urgency?.cssClass === "deadline-expired" ? "deadline-expired" : undefined}>
        {formatDate(deadlineAt)}
      </span>
      {urgency && urgency.cssClass !== "deadline-expired" && (
        <span className={`deadline-badge ${urgency.cssClass}`}>{urgency.label}</span>
      )}
    </td>
  );
}

export default async function DashboardPage({ searchParams }: Props) {
  const { page: pageParam, country, keyword, view, sort, dir } = await searchParams;
  const page = Number(pageParam || "1") || 1;
  const data = await getDashboardData(page, 25, country, keyword, view ?? "active", sort, dir);

  function buildUrl(params: {
    country?: string;
    keyword?: string;
    view?: "active" | "archived" | "all";
    page?: number;
    sort?: string;
    dir?: string;
  }) {
    const parts: string[] = [];
    if (params.country) parts.push(`country=${encodeURIComponent(params.country)}`);
    if (params.keyword) parts.push(`keyword=${encodeURIComponent(params.keyword)}`);
    if (params.view && params.view !== "active") parts.push(`view=${params.view}`);
    if (params.sort) parts.push(`sort=${params.sort}`);
    if (params.dir) parts.push(`dir=${params.dir}`);
    if (params.page && params.page > 1) parts.push(`page=${params.page}`);
    return parts.length ? `/dashboard?${parts.join("&")}` : "/dashboard";
  }

  function buildDashboardHref(
    params: {
      country?: string;
      keyword?: string;
      view?: "active" | "archived" | "all";
      page?: number;
      sort?: string;
      dir?: string;
    },
    includeResultsAnchor: boolean = false,
  ) {
    const query: Record<string, string> = {};
    if (params.country) query.country = params.country;
    if (params.keyword) query.keyword = params.keyword;
    if (params.view && params.view !== "active") query.view = params.view;
    if (params.sort) query.sort = params.sort;
    if (params.dir) query.dir = params.dir;
    if (params.page && params.page > 1) query.page = String(params.page);

    return {
      pathname: "/dashboard",
      query,
      hash: includeResultsAnchor ? RESULTS_SECTION_ID : undefined,
    } as const;
  }

  function resultsHref(params: {
    country?: string;
    keyword?: string;
    view?: "active" | "archived" | "all";
    page?: number;
    sort?: string;
    dir?: string;
  }) {
    return buildDashboardHref(params, true);
  }

  function sortHref(field: string) {
    const isActive = data.sort === field;
    const nextDir = isActive && data.dir === "desc" ? "asc" : "desc";
    return resultsHref({ country, keyword, view: data.view, sort: field, dir: nextDir });
  }

  function sortIndicator(field: string) {
    if (data.sort !== field) return " ↕";
    return data.dir === "desc" ? " ↓" : " ↑";
  }

  const pipeline = data.snapshot.pipeline;
  const activePursuits =
    (pipeline.watching ?? 0) + (pipeline.drafting ?? 0) + (pipeline.submitted ?? 0);
  const showingAllTenders =
    data.view !== "active" || data.activeSearchCount === 0 || Boolean(country) || Boolean(keyword);

  return (
    <main className="page-shell">
      <section className="panel-grid">
        <div className="card card-strong section-stack highlight-panel">
          <span className="eyebrow">Dashboard</span>
          <h1 className="title-lg">Ranked opportunities for a small bid team.</h1>
          <p className="lede">
            This view is tuned for fast qualification: what is worth watching, what is already warm,
            and what should never reach your pipeline.
          </p>

          <div className="insight-strip">
            <span className="insight-pill">{data.snapshot.activeTenders} live tenders</span>
            <span className="insight-pill">{data.snapshot.archivedTenders} archived</span>
            <span className="insight-pill">{data.snapshot.strongMatches} high-fit matches</span>
            <span className="insight-pill">{data.activeSearchCount} active searches</span>
          </div>

          <div className="action-row">
            <Link href="/searches/new" className="button">
              Add search profile
            </Link>
            <Link href="/" className="button secondary">
              View product overview
            </Link>
          </div>
        </div>

        <div className="card section-stack">
          <div>
            <div className="section-label">Pipeline activity</div>
            <div className="kpi">{activePursuits}</div>
            <p className="metric-note">Opportunities currently being watched, drafted, or submitted.</p>
          </div>

          <div className="country-list">
            {PIPELINE_STAGES.map(({ key, label, color }) => {
              const count = pipeline[key] ?? 0;
              if (count === 0) return null;

              return (
                <div
                  key={key}
                  className="card-inset"
                  style={{
                    minWidth: 110,
                    borderColor: `color-mix(in srgb, ${color} 28%, white)`,
                    background: `color-mix(in srgb, ${color} 10%, white)`,
                  }}
                >
                  <div className="section-label">{label}</div>
                  <div className="kpi-sm" style={{ color }}>{count}</div>
                </div>
              );
            })}
          </div>

          <p className="note" style={{ margin: 0 }}>
            {activePursuits === 0
              ? "No active pursuits yet. Start by creating a sharper search profile."
              : "Pipeline counts update directly from the tender detail workflow."}
          </p>
        </div>
      </section>

      <section className="metric-grid">
        <div className="card metric-card">
          <div className="section-label">Live tenders</div>
          <div className="metric-value">{data.snapshot.activeTenders}</div>
          <div className="metric-note">Open or still-actionable notices in the current dataset.</div>
        </div>
        <div className="card metric-card">
          <div className="section-label">High-fit</div>
          <div className="metric-value">{data.snapshot.strongMatches}</div>
          <div className="metric-note">Matches scoring 70 or above across all profiles.</div>
        </div>
        <div className="card metric-card">
          <div className="section-label">Search profiles</div>
          <div className="metric-value">{data.activeSearchCount}</div>
          <div className="metric-note">
            Active profiles currently shaping the ranking logic.
          </div>
        </div>
        <div className="card metric-card">
          <div className="section-label">Archived</div>
          <div className="metric-value">{data.snapshot.archivedTenders}</div>
          <div className="metric-note">Older notices kept for learning, buyer history, and pattern tracking.</div>
        </div>
        <div className="card metric-card">
          <div className="section-label">Recurring patterns</div>
          <div className="metric-value">{data.recurringFamilies}</div>
          <div className="metric-note">Buyer/CPV families seen more than once across live and archived notices.</div>
        </div>
      </section>

      <section className="card section-stack">
        <div>
          <div className="section-label">Lifecycle</div>
          <h2 className="title-md">Review scope</h2>
        </div>

        <div className="filter-cluster">
          {[
            { key: "active", label: "Live only" },
            { key: "archived", label: "Archive only" },
            { key: "all", label: "Live + archive" },
          ].map(({ key, label }) => (
            <Link
              key={key}
              href={resultsHref({ country, keyword, view: key as "active" | "archived" | "all" })}
              scroll={false}
              className={`country-chip${data.view === key ? " is-active" : ""}`}
            >
              {label}
            </Link>
          ))}
        </div>
      </section>

      <section className="grid grid-2">
        <div className="card section-stack">
          <div className="row-between">
            <div>
              <h2 className="title-md">Source mix</h2>
              <p className="muted" style={{ margin: "6px 0 0" }}>
                Where the current tender inventory comes from.
              </p>
            </div>
          </div>

          <div className="stack">
            {Object.entries(data.snapshot.bySource).length === 0 ? (
              <p className="empty-state">No source data yet.</p>
            ) : (
              Object.entries(data.snapshot.bySource)
                .sort((a, b) => b[1] - a[1])
                .map(([source, count]) => {
                  const width = data.snapshot.totalTenders
                    ? Math.max(8, Math.round((count / data.snapshot.totalTenders) * 100))
                    : 0;

                  return (
                    <div key={source} className="stack-sm">
                      <div className="row-between">
                        <span className="tag">{source.toUpperCase()}</span>
                        <span className="mono" style={{ color: "var(--ink-soft)", fontSize: "0.82rem" }}>
                          {count}
                        </span>
                      </div>
                      <div
                        style={{
                          height: 10,
                          borderRadius: 999,
                          background: "rgba(72, 54, 38, 0.08)",
                          overflow: "hidden",
                        }}
                      >
                        <div
                          style={{
                            width: `${width}%`,
                            height: "100%",
                            borderRadius: 999,
                            background: "var(--accent-gradient)",
                          }}
                        />
                      </div>
                    </div>
                  );
                })
            )}
          </div>
        </div>

        <div className="card section-stack">
          <div>
            <h2 className="title-md">Trending keywords</h2>
            <p className="muted" style={{ margin: "6px 0 0" }}>
              Frequent terms across the current dataset. Click any term to filter the tender list.
            </p>
          </div>

          {data.topKeywords.length === 0 ? (
            <p className="empty-state">No keywords extracted yet.</p>
          ) : (
            <div className="keyword-cloud">
              {data.topKeywords.map(({ word, count }) => {
                const isActive = word === keyword;
                const href = resultsHref(
                  isActive
                    ? { country, view: data.view }
                    : { country, keyword: word, view: data.view },
                );
                const scale = Math.min(1.28, 0.88 + count / Math.max(data.topKeywords[0].count, 1));

                return (
                  <Link
                    key={word}
                    href={href}
                    scroll={false}
                    className={`keyword-link${isActive ? " is-active" : ""}`}
                    style={{ fontSize: `${scale}rem`, fontWeight: isActive ? 800 : 700 }}
                    title={`${count} occurrences`}
                  >
                    {word}
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {data.allCountries.length > 0 && (
        <section className="card section-stack">
          <div>
            <div className="section-label">Geography</div>
            <h2 className="title-md">Country filter</h2>
          </div>

          <div className="country-list">
            <Link
              href={resultsHref({ keyword, view: data.view })}
              scroll={false}
              className={`country-chip${!country ? " is-active" : ""}`}
            >
              All countries
            </Link>

            {data.allCountries.slice(0, 20).map(({ country: value, count }) => {
              const isActive = value === country;

              return (
                <Link
                  key={value}
                  href={resultsHref(
                    isActive
                      ? { keyword, view: data.view }
                      : { country: value, keyword, view: data.view },
                  )}
                  scroll={false}
                  className={`country-chip${isActive ? " is-active" : ""}`}
                >
                  <span>{countryFlag(value)}</span>
                  <span>{value}</span>
                  <span className="mono" style={{ fontSize: "0.75rem" }}>
                    {count}
                  </span>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      <section className="card section-stack">
        <div className="toolbar">
          <div>
            <h2 className="title-md">Saved searches</h2>
            <p className="muted" style={{ margin: "6px 0 0" }}>
              {data.searches.length === 0
                ? "Create a profile to start ranking opportunities against your delivery strengths."
                : `${data.activeSearchCount} active of ${data.searches.length} profile${data.searches.length === 1 ? "" : "s"} shaping the shortlist.`}
            </p>
          </div>

          <Link href="/searches/new" className="button secondary">
            {data.searches.length === 0 ? "Create first profile" : "Add another"}
          </Link>
        </div>

        {data.searches.length === 0 ? (
          <div className="empty-state">
            No saved searches yet. The dashboard can still show the raw tender inventory below.
          </div>
        ) : (
          <div className="stack">
            {data.searches.map((search) => (
              <div
                key={search.id}
                className="card-inset"
                style={{
                  opacity: search.enabled ? 1 : 0.62,
                  borderColor: search.enabled
                    ? undefined
                    : "color-mix(in srgb, var(--ink-faint) 18%, white)",
                }}
              >
                <div className="match-summary">
                  <div className="stack-sm" style={{ maxWidth: 720 }}>
                    <div className="filter-cluster">
                      <strong style={{ fontSize: "1rem" }}>{search.name}</strong>
                      <span className="tag">{search.enabled ? "Active" : "Disabled"}</span>
                    </div>
                    <div className="filter-cluster">
                      {search.keywordsInclude.map((kw) => (
                        <span key={kw} className="tag">
                          {kw}
                        </span>
                      ))}
                    </div>
                    <p className="note" style={{ margin: 0 }}>
                      {search.countries.length > 0 ? search.countries.join(", ") : "Any country"}
                      {" • "}Min score {search.minScore}
                    </p>
                    {!search.enabled && (
                      <p className="note" style={{ margin: 0 }}>
                        Disabled profiles stay saved but do not influence ranking or match counts.
                      </p>
                    )}
                  </div>

                  <form action={toggleSearchEnabled}>
                    <input type="hidden" name="id" value={search.id} />
                    <input type="hidden" name="enabled" value={search.enabled ? "false" : "true"} />
                    <button
                      type="submit"
                      className={search.enabled ? "button secondary" : "button"}
                    >
                      {search.enabled ? "Disable" : "Enable"}
                    </button>
                  </form>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {showingAllTenders ? (
        <section id={RESULTS_SECTION_ID} className="card section-stack table-shell">
          <div className="toolbar">
            <div>
              <h2 className="title-md">
                {country
                  ? `${country} tenders`
                  : data.view === "archived"
                    ? "Archived tenders"
                    : data.view === "all"
                      ? "All tenders"
                      : "Live tenders"}
              </h2>
              <p className="muted" style={{ margin: "6px 0 0" }}>
                {keyword
                  ? `Filtered by keyword "${keyword}".`
                  : data.view === "archived"
                    ? "Historical notices kept for archive analytics and buyer memory."
                    : data.view === "all"
                      ? "Live and archived tenders together."
                  : data.activeSearchCount === 0
                    ? "Raw tender inventory, prioritized by SME suitability by default."
                    : "Raw tender inventory in the current environment."}
              </p>
            </div>

            {data.pagination && (
              <span className="mono" style={{ color: "var(--ink-faint)", fontSize: "0.82rem" }}>
                Page {data.pagination.page} of {data.pagination.totalPages}
              </span>
            )}
          </div>

          {keyword && (
            <div className="filter-cluster">
              <span className="tag">{keyword}</span>
              <Link href={resultsHref({ country, view: data.view })} scroll={false} className="nav-link" style={{ padding: 0 }}>
                Clear filter
              </Link>
            </div>
          )}

          {data.allTenders?.length === 0 ? (
            <p className="empty-state">No tenders match the current filters.</p>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Tender</th>
                    <th>Buyer</th>
                    <th>Country</th>
                    <th>
                      <Link href={sortHref("published")} className={`sort-header${data.sort === "published" ? " active" : ""}`}>
                        Published{sortIndicator("published")}
                      </Link>
                    </th>
                    <th>
                      <Link href={sortHref("deadline")} className={`sort-header${data.sort === "deadline" ? " active" : ""}`}>
                        Deadline{sortIndicator("deadline")}
                      </Link>
                    </th>
                    <th>
                      <Link href={sortHref("sme")} className={`sort-header${data.sort === "sme" ? " active" : ""}`}>
                        SME fit{sortIndicator("sme")}
                      </Link>
                    </th>
                    <th>
                      <Link href={sortHref("value")} className={`sort-header${data.sort === "value" ? " active" : ""}`}>
                        Value{sortIndicator("value")}
                      </Link>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {data.allTenders?.map((tender) => {
                    const smeFit = data.smeScores[tender.id] ?? 0;

                    return (
                      <tr key={tender.id}>
                        <td>
                          <div className="stack-sm">
                            <Link href={`/tenders/${tender.id}`}>
                              <strong>{tender.title}</strong>
                            </Link>
                            <div className="filter-cluster">
                              <span className="tag">{tender.source.toUpperCase()}</span>
                              <span className="tag">
                                {tender.lifecycleStatus === "archived" ? "Archived" : "Live"}
                              </span>
                            </div>
                          </div>
                        </td>
                        <td className="muted">{tender.buyerName}</td>
                        <td className="muted">
                          {countryFlag(tender.country ?? "")} {tender.country}
                        </td>
                        <td className="muted">{formatDate(tender.publishedAt)}</td>
                        <DeadlineCell deadlineAt={tender.deadlineAt} />
                        <td>
                          <span className={`score-pill ${getScoreClass(smeFit)}`}>{smeFit}</span>
                        </td>
                        <td className="muted">{formatCurrency(tender.estimatedValue, tender.currency)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {data.pagination && (
            <div className="toolbar">
              <span className="mono" style={{ color: "var(--ink-faint)", fontSize: "0.82rem" }}>
                Page {data.pagination.page} of {data.pagination.totalPages}
              </span>

              <div className="action-row">
                <Link
                  href={buildDashboardHref({
                    country,
                    keyword,
                    view: data.view,
                    sort: data.sort,
                    dir: data.dir,
                    page: data.pagination.page > 1 ? data.pagination.page - 1 : undefined,
                  }, true)}
                  scroll={false}
                  className="button secondary"
                  aria-disabled={data.pagination.page === 1}
                >
                  Previous
                </Link>
                <Link
                  href={buildDashboardHref({
                    country,
                    keyword,
                    view: data.view,
                    sort: data.sort,
                    dir: data.dir,
                    page:
                      data.pagination.page < data.pagination.totalPages
                        ? data.pagination.page + 1
                        : data.pagination.totalPages,
                  }, true)}
                  scroll={false}
                  className="button secondary"
                  aria-disabled={data.pagination.page === data.pagination.totalPages}
                >
                  Next
                </Link>
              </div>
            </div>
          )}
        </section>
      ) : (
        <section id={RESULTS_SECTION_ID} className="card section-stack table-shell">
          <div className="toolbar">
            <div>
              <h2 className="title-md">Top matches</h2>
              <p className="muted" style={{ margin: "6px 0 0" }}>
                Best current opportunities across your saved profiles.
              </p>
            </div>
            <span className="mono" style={{ color: "var(--ink-faint)", fontSize: "0.82rem" }}>
              {data.matches.length} shown
            </span>
          </div>

          {data.matches.length === 0 ? (
            <p className="empty-state">No matches yet. Tighten or broaden your search profiles.</p>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Tender</th>
                    <th>Buyer</th>
                    <th>Country</th>
                    <th>
                      <Link href={sortHref("published")} className={`sort-header${data.sort === "published" ? " active" : ""}`}>
                        Published{sortIndicator("published")}
                      </Link>
                    </th>
                    <th>
                      <Link href={sortHref("deadline")} className={`sort-header${data.sort === "deadline" ? " active" : ""}`}>
                        Deadline{sortIndicator("deadline")}
                      </Link>
                    </th>
                    <th>
                      <Link href={sortHref("value")} className={`sort-header${data.sort === "value" ? " active" : ""}`}>
                        Value{sortIndicator("value")}
                      </Link>
                    </th>
                    <th>
                      <Link href={sortHref("score")} className={`sort-header${data.sort === "score" ? " active" : ""}`}>
                        Score{sortIndicator("score")}
                      </Link>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {data.matches.map((match) => (
                    <tr key={`${match.searchId}-${match.tenderId}-${match.matchedScope?.id ?? "notice"}`}>
                      <td>
                        <div className="stack-sm">
                          <Link href={`/tenders/${match.tenderId}`}>
                            <strong>{match.title}</strong>
                          </Link>
                          <div className="filter-cluster">
                            <span className="tag">{match.source.toUpperCase()}</span>
                            {match.matchedScope?.kind === "lot" && (
                              <span className="tag">{match.matchedScope.title}</span>
                            )}
                            {match.matchReasons.slice(0, 2).map((reason) => (
                              <span key={reason} className="note">
                                {reason}
                              </span>
                            ))}
                          </div>
                        </div>
                      </td>
                      <td className="muted">{match.buyerName}</td>
                      <td className="muted">
                        {countryFlag(match.country ?? "")} {match.country}
                      </td>
                      <td className="muted">{formatDate(match.publishedAt)}</td>
                      <DeadlineCell deadlineAt={match.deadlineAt} />
                      <td className="muted">{formatCurrency(match.estimatedValue, match.currency)}</td>
                      <td>
                        <div className="stack-sm">
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
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </main>
  );
}
