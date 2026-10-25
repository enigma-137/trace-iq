# Blog posts

Each post is a folder with a `page.mdx`. The folder name is the URL slug, and the
blog index lists every folder automatically, newest first.

To publish, copy an existing post's folder and edit its `post` export:

```mdx
import { BlogPostLayout } from '@/components/BlogPostLayout'

export const post = {
  title: 'Post title',
  description: 'Shown on the blog index and used as the meta description.',
  lede: 'Intro paragraph under the title on the post page.',
  date: '2026-10-25',
  readTime: '5 min read',
  tag: 'Engineering'
}

export const metadata = { title: post.title, description: post.description }

<BlogPostLayout {...post}>

Markdown content goes here.

</BlogPostLayout>
```

`tests/blog-posts.test.ts` checks that every post has these fields.
