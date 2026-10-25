import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { formatPostDate, sortPosts, type BlogPost } from '../src/lib/blog';

const blogDir = join(__dirname, '../src/app/blog');
const slugs = readdirSync(blogDir, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && existsSync(join(blogDir, entry.name, 'page.mdx')))
  .map((entry) => entry.name);

describe('blog posts', () => {
  it('finds the published posts', () => {
    expect(slugs.length).toBeGreaterThanOrEqual(3);
  });

  // The blog index reads each post's `post` export, so a missing field would
  // only show up as a broken card on /blog.
  it.each(slugs)('%s exports complete post metadata and renders it', (slug) => {
    const source = readFileSync(join(blogDir, slug, 'page.mdx'), 'utf8');
    expect(source).toMatch(/^export const post = \{$/m);
    for (const field of ['title', 'description', 'lede', 'readTime', 'tag']) {
      expect(source, field).toMatch(new RegExp(`^  ${field}: '.+',?$`, 'm'));
    }
    expect(source).toMatch(/^ {2}date: '\d{4}-\d{2}-\d{2}',?$/m);
    expect(source).toContain('export const metadata = { title: post.title, description: post.description }');
    expect(source).toContain('<BlogPostLayout {...post}>');
  });
});

describe('formatPostDate', () => {
  it('formats the date the same way in every time zone', () => {
    expect(formatPostDate('2026-09-22')).toBe('September 22, 2026');
    expect(formatPostDate('2026-01-01')).toBe('January 1, 2026');
  });
});

describe('sortPosts', () => {
  const post = (slug: string, date: string) => ({ slug, date }) as BlogPost;

  it('puts the newest first and breaks ties by slug', () => {
    expect(sortPosts([post('b', '2026-08-27'), post('c', '2026-09-22'), post('a', '2026-08-27')]).map(({ slug }) => slug)).toEqual(['c', 'a', 'b']);
  });
});
