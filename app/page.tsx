import Link from "next/link";
import { getDashboardSnapshot } from "@/lib/repository";

const OPERATING_PRINCIPLES = [
  "Supplier-profile matching instead of raw keyword spam.",
  "Clear fit reasons so your team can decide quickly.",
  "Pipeline tracking from watchlist to submitted bid.",
];

const BUILT_NOW = [
  "TED ingestion and tender normalization",
  "Search profiles with exclusions, CPV, geography, and score thresholds",
  "Ranked dashboard and tender detail views",
  "Digest pipeline for daily review workflows",
];

const PROCESS_STEPS = [
  {
    index: "01",
    title: "Describe the work you actually sell",
    copy: "Capture delivery keywords, CPV codes, target countries, and hard exclusions once.",
  },
  {
    index: "02",
    title: "Let the matcher rank each notice",
    copy: "The app scores fresh tenders and keeps the reasons attached to every opportunity.",
  },
  {
    index: "03",
    title: "Work the shortlist, not the feed",
    copy: "Use the pipeline tracker to focus on the tenders you might genuinely pursue.",
  },
];

export default async function HomePage() {
  const snapshot = await getDashboardSnapshot();

  return (
    <main className="page-shell">
      <section className="hero">
        <div className="card card-strong hero-copy section-stack highlight-panel">
          <span className="eyebrow">Opportunity triage for consultancies</span>
          <div className="accent-line" />
          <h1 className="title-xl">Stop scanning tender sludge.</h1>
          <p className="lede">
            Tender Hunter turns procurement notices into a shortlist your delivery team can
            understand fast. It ranks fit, keeps the reasons visible, and cuts out the work you
            were never going to bid on.
          </p>

          <div className="hero-metrics">
            <div className="card-inset">
              <div className="section-label">Current dataset</div>
              <div className="kpi-sm">{snapshot.totalTenders}</div>
              <div className="metric-note">Normalized tenders live in this environment.</div>
            </div>
            <div className="card-inset">
              <div className="section-label">High-fit leads</div>
              <div className="kpi-sm">{snapshot.strongMatches}</div>
              <div className="metric-note">Matches already scoring 70+ against saved searches.</div>
            </div>
          </div>

          <div className="action-row">
            <Link href="/dashboard" className="button">
              Open dashboard
            </Link>
            <Link href="/searches/new" className="button secondary">
              Create search profile
            </Link>
          </div>
        </div>

        <div className="hero-side">
          <div className="card section-stack">
            <div>
              <div className="section-label">MVP snapshot</div>
              <div className="kpi">{snapshot.totalSearches}</div>
              <p className="metric-note">Saved search profiles are already shaping the ranking layer.</p>
            </div>

            <div className="insight-strip">
              <span className="insight-pill">Small IT teams</span>
              <span className="insight-pill">Fit scoring</span>
              <span className="insight-pill">Daily digest workflow</span>
            </div>

            <ul className="list-plain">
              {OPERATING_PRINCIPLES.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>

          <div className="card section-stack">
            <div>
              <h2 className="title-md">Already built</h2>
              <p className="muted" style={{ margin: "6px 0 0" }}>
                Enough of the workflow exists to evaluate real tenders, not just a mock UI.
              </p>
            </div>

            <ul className="list-tight">
              {BUILT_NOW.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section className="grid grid-2">
        <div className="card section-stack">
          <div>
            <div className="section-label">Why it matters</div>
            <h2 className="title-lg">Less feed, more signal.</h2>
          </div>
          <p className="lede" style={{ margin: 0 }}>
            Generic procurement search surfaces every possible notice. This product is opinionated:
            it assumes your team needs a strong match to win, and the interface reflects that.
          </p>
        </div>

        <div className="card section-stack">
          <div>
            <div className="section-label">What the interface should do</div>
            <h2 className="title-lg">Make a pursuit decision in minutes.</h2>
          </div>
          <div className="insight-strip">
            <span className="insight-pill">Who is buying</span>
            <span className="insight-pill">What is being bought</span>
            <span className="insight-pill">Why it matches</span>
            <span className="insight-pill">How urgent it is</span>
          </div>
        </div>
      </section>

      <section className="section-stack">
        <div className="page-head-copy">
          <span className="eyebrow">Workflow</span>
          <h2 className="title-lg">Designed around qualification, not browsing.</h2>
        </div>

        <div className="process-grid">
          {PROCESS_STEPS.map((step) => (
            <div key={step.index} className="card process-card section-stack">
              <div className="process-index">{step.index}</div>
              <h3 className="title-md">{step.title}</h3>
              <p className="muted" style={{ margin: 0 }}>
                {step.copy}
              </p>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
