export type BlogPost = {
  slug: string;
  title: string;
  publishedAt: string;
  summary: string;
  content: string[];
};

const BLOG_POSTS: BlogPost[] = [
  {
    slug: "why-we-score-lots-not-just-notices",
    title: "Why we score lots, not just notices",
    publishedAt: "2026-03-08",
    summary:
      "Many public tenders look too broad until you isolate the one lot that a small software consultancy can actually deliver.",
    content: [
      "A whole notice can look too big, too operational, or too messy for a small team. But that often hides a single lot that is much more realistic: software build, advisory support, or a bounded migration package.",
      "That is why Tender Hunter now extracts likely lots and scores them separately. The goal is simple: stop rejecting the right work because the wrong lot made the notice look heavy.",
      "For SMEs, precision matters more than volume. Better lot detection means a shorter shortlist, fewer false negatives, and faster qualification.",
    ],
  },
];

export function getAllBlogPosts() {
  return BLOG_POSTS;
}

export function getBlogPost(slug: string) {
  return BLOG_POSTS.find((post) => post.slug === slug) ?? null;
}
