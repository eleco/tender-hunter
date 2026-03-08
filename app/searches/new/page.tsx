import { createSearch } from "./actions";

const GUIDANCE = [
  "Keep include keywords commercial, not just technical. Use terms buyers actually write.",
  "Use exclusions aggressively to remove sectors your team never delivers into.",
  "Set a minimum score that reflects realistic win probability, not curiosity.",
];

export default function NewSearchPage() {
  return (
    <main className="page-shell">
      <section className="page-head">
        <div className="page-head-copy">
          <span className="eyebrow">Saved search builder</span>
          <h1 className="title-lg">Define what your consultancy should chase.</h1>
          <p className="lede">
            A good search profile acts like a commercial filter. It should describe where you win,
            where you do not, and how much ambiguity you are willing to tolerate.
          </p>
        </div>

        <a href="/dashboard" className="button secondary page-head-action">
          Back to dashboard
        </a>
      </section>

      <section className="form-shell">
        <form action={createSearch} className="card card-strong form-layout">
          <div className="form-section">
            <div className="form-section-header">
              <div className="section-label">Identity</div>
              <h2 className="title-md">Give the profile a useful commercial name.</h2>
            </div>

            <div className="form-group">
              <label htmlFor="name">Search name</label>
              <input
                id="name"
                name="name"
                placeholder="Spanish cloud delivery and platform engineering"
                required
              />
              <div className="field-hint">Name it so someone else can immediately understand what this profile is for.</div>
            </div>
          </div>

          <div className="form-section">
            <div className="form-section-header">
              <div className="section-label">Matching logic</div>
              <h2 className="title-md">Tell the scorer what should count as a real fit.</h2>
            </div>

            <div className="form-group">
              <label htmlFor="keywordsInclude">Include keywords</label>
              <input
                id="keywordsInclude"
                name="keywordsInclude"
                placeholder="cloud migration, devops, kubernetes, aws, software delivery"
                required
              />
              <div className="field-hint">Comma-separated. English keywords will also match core French and Spanish equivalents where supported.</div>
            </div>

            <div className="form-group">
              <label htmlFor="keywordsExclude">Exclude keywords</label>
              <input
                id="keywordsExclude"
                name="keywordsExclude"
                placeholder="construction, staffing, laptops, furniture"
              />
              <div className="field-hint">Use this to kill irrelevant sectors before they waste review time, including core French and Spanish equivalents.</div>
            </div>

            <div className="form-group">
              <label htmlFor="cpvInclude">CPV codes</label>
              <input
                id="cpvInclude"
                name="cpvInclude"
                placeholder="72000000, 72262000, 72222300"
              />
              <div className="field-hint">Optional, but useful when your delivery scope lines up with known procurement codes.</div>
            </div>
          </div>

          <div className="form-section">
            <div className="form-section-header">
              <div className="section-label">Geography</div>
              <h2 className="title-md">Limit the profile to places you can actually deliver.</h2>
            </div>

            <div className="form-group">
              <label htmlFor="countries">Countries</label>
              <input id="countries" name="countries" placeholder="Spain, France, Belgium" />
              <div className="field-hint">Leave empty if geography is not a meaningful constraint.</div>
            </div>
          </div>

          <div className="form-section">
            <div className="form-section-header">
              <div className="section-label">Commercial filters</div>
              <h2 className="title-md">Stop under-sized or too-urgent work from surfacing.</h2>
            </div>

            <div className="field-grid">
              <div className="form-group">
                <label htmlFor="minValue">Minimum value (EUR)</label>
                <input id="minValue" name="minValue" type="number" min="0" defaultValue="50000" />
              </div>
              <div className="form-group">
                <label htmlFor="maxDaysToDeadline">Max days to deadline</label>
                <input
                  id="maxDaysToDeadline"
                  name="maxDaysToDeadline"
                  type="number"
                  min="1"
                  defaultValue="45"
                />
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="minScore">Minimum fit score</label>
              <input
                id="minScore"
                name="minScore"
                type="number"
                min="0"
                max="100"
                defaultValue="55"
              />
              <div className="field-hint">Set the quality bar for what deserves attention. Start strict, then relax if needed.</div>
            </div>
          </div>

          <div className="action-row">
            <button type="submit" className="button">
              Save search profile
            </button>
            <button type="reset" className="button secondary">
              Reset form
            </button>
          </div>
        </form>

        <aside className="card section-stack">
          <div>
            <div className="section-label">Operator notes</div>
            <h2 className="title-md">How to keep the shortlist credible.</h2>
          </div>

          <ul className="list-tight">
            {GUIDANCE.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>

          <div className="card-inset section-stack">
            <div className="section-label">Good default profile</div>
            <p className="note" style={{ margin: 0 }}>
              Use one profile per delivery capability or market segment. If one search tries to cover
              everything, the score stops meaning anything.
            </p>
          </div>

          <div className="card-inset section-stack">
            <div className="section-label">Review habit</div>
            <p className="note" style={{ margin: 0 }}>
              After a week of real tenders, look at false positives first. They tell you how to tighten the model faster.
            </p>
          </div>
        </aside>
      </section>
    </main>
  );
}
