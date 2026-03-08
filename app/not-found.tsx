import Link from "next/link";

export default function NotFoundPage() {
  return (
    <main className="page-shell">
      <section className="card card-strong section-stack" style={{ maxWidth: 720, margin: "0 auto" }}>
        <span className="eyebrow">Not found</span>
        <h1 className="title-lg">That page does not exist.</h1>
        <p className="lede">
          The route may be wrong, stale, or no longer available in the current dataset.
        </p>
        <div className="action-row">
          <Link href="/dashboard" className="button">
            Go to dashboard
          </Link>
          <Link href="/" className="button secondary">
            Back home
          </Link>
        </div>
      </section>
    </main>
  );
}
