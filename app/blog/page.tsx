import Link from "next/link";
import { getAllBlogPosts } from "@/lib/blog";
import { formatDate } from "@/lib/format";

export const metadata = {
  title: "Blog | Tender Hunter",
  description: "Short notes on tender qualification, SME fit, and public-sector opportunity filtering.",
};

export default function BlogIndexPage() {
  const posts = getAllBlogPosts();

  return (
    <main className="page-shell">
      <section className="card card-strong section-stack highlight-panel">
        <span className="eyebrow">Blog</span>
        <h1 className="title-lg">Short notes on better tender qualification.</h1>
        <p className="lede" style={{ margin: 0 }}>
          Small product updates, ranking decisions, and procurement patterns worth keeping visible.
        </p>
      </section>

      <section className="section-stack">
        {posts.map((post) => (
          <article key={post.slug} className="card section-stack">
            <div className="stack-sm">
              <div className="section-label">{formatDate(post.publishedAt)}</div>
              <h2 className="title-md" style={{ margin: 0 }}>
                <Link href={`/blog/${post.slug}`}>{post.title}</Link>
              </h2>
              <p className="muted" style={{ margin: 0 }}>
                {post.summary}
              </p>
            </div>

            <div className="action-row">
              <Link href={`/blog/${post.slug}`} className="button secondary">
                Read post
              </Link>
            </div>
          </article>
        ))}
      </section>
    </main>
  );
}
