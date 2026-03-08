import Link from "next/link";
import { notFound } from "next/navigation";
import { getAllBlogPosts, getBlogPost } from "@/lib/blog";
import { formatDate } from "@/lib/format";

type Props = {
  params: Promise<{ slug: string }>;
};

export async function generateStaticParams() {
  return getAllBlogPosts().map((post) => ({ slug: post.slug }));
}

export default async function BlogPostPage({ params }: Props) {
  const { slug } = await params;
  const post = getBlogPost(slug);

  if (!post) {
    notFound();
  }

  return (
    <main className="page-shell">
      <Link href="/blog" className="back-link">
        ← Back to blog
      </Link>

      <article className="card card-strong section-stack highlight-panel">
        <span className="eyebrow">Blog</span>
        <div className="section-label">{formatDate(post.publishedAt)}</div>
        <h1 className="title-lg">{post.title}</h1>
        <p className="lede" style={{ margin: 0 }}>
          {post.summary}
        </p>
        <div className="stack">
          {post.content.map((paragraph) => (
            <p key={paragraph} className="muted" style={{ margin: 0, fontSize: "1rem" }}>
              {paragraph}
            </p>
          ))}
        </div>
      </article>
    </main>
  );
}
