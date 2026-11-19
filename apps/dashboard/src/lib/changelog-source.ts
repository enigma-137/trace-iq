import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { toHtml } from 'hast-util-to-html';
import remarkGfm from 'remark-gfm';
import remarkParse from 'remark-parse';
import remarkRehype from 'remark-rehype';
import { unified } from 'unified';
import { sortEntries, type ChangelogArea, type ChangelogEntry } from './changelog';

/** The public site's address, used to make links in the feed and emails absolute. */
export const SITE_URL = 'https://traceiq.run';

export const entryUrl = (slug: string) => `${SITE_URL}/changelog#${slug}`;

export type ChangelogEntryWithHtml = ChangelogEntry & { html: string };

const CONTENT_DIR = join(process.cwd(), 'src/content/changelog');

/**
 * Reads the `entry` export and Markdown body of one changelog file. The /changelog page
 * renders the same files through MDX; this is for places that need plain HTML (the RSS
 * feed and the email digest), where React can't render.
 */
export function parseEntrySource(slug: string, source: string): ChangelogEntryWithHtml {
  const field = (name: string) => source.match(new RegExp(`^ {2}${name}: '(.+)',?$`, 'm'))?.[1];
  const title = field('title');
  const date = field('date');
  const areas = [...(source.match(/^ {2}areas: \[(.+)\],?$/m)?.[1] ?? '').matchAll(/'([^']+)'/g)].map((m) => m[1]);
  if (!title || !date || areas.length === 0) throw new Error(`Changelog entry ${slug} is missing title, date or areas.`);

  const end = source.search(/^\}$/m);
  const markdown = end === -1 ? '' : source.slice(end + 1).trim();
  return { slug, title: title.replace(/\\'/g, "'"), date, areas: areas as ChangelogArea[], html: markdownToHtml(markdown) };
}

/** Markdown to HTML with GitHub-style extras, and root-relative links made absolute. */
export function markdownToHtml(markdown: string): string {
  const processor = unified().use(remarkParse).use(remarkGfm).use(remarkRehype);
  const tree = processor.runSync(processor.parse(markdown));
  return toHtml(tree).replace(/(href|src)="\/(?!\/)/g, `$1="${SITE_URL}/`);
}

/** Every changelog entry, newest first, with its body as HTML. */
export function readChangelogEntries(dir = CONTENT_DIR): ChangelogEntryWithHtml[] {
  const files = readdirSync(dir).filter((name) => name.endsWith('.mdx'));
  return sortEntries(files.map((name) => parseEntrySource(name.replace(/\.mdx$/, ''), readFileSync(join(dir, name), 'utf8'))));
}
