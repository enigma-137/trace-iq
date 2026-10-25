import { sortPosts, type BlogPost, type BlogPostMeta } from '@/lib/blog';

// Every `<slug>/page.mdx` in this folder is a post; webpack bundles the
// matching files at build time, so publishing is just adding a folder.
const postModules = require.context('./', true, /^\.\/[^/]+\/page\.mdx$/);

export const posts: BlogPost[] = sortPosts(
  postModules.keys().map((key) => ({ slug: key.split('/')[1], ...postModules<{ post: BlogPostMeta }>(key).post }))
);
