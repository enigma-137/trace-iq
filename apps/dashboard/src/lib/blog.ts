/** The `post` object each `src/app/blog/<slug>/page.mdx` exports. */
export type BlogPostMeta = {
  title: string;
  /** Shown on the blog index and used as the page's meta description. */
  description: string;
  /** Intro paragraph under the post's title. */
  lede: string;
  /** Publication date, YYYY-MM-DD. */
  date: string;
  readTime: string;
  tag: string;
};

export type BlogPost = BlogPostMeta & { slug: string };

export function formatPostDate(date: string) {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });
}

/** Newest first; posts on the same day keep a stable, alphabetical order. */
export function sortPosts(posts: BlogPost[]) {
  return [...posts].sort((a, b) => b.date.localeCompare(a.date) || a.slug.localeCompare(b.slug));
}
