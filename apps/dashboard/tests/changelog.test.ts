import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { markdownToHtml, parseEntrySource, readChangelogEntries } from '../src/lib/changelog-source';
import { CHANGELOG_AREAS, formatEntryDate, formatMonth, sortEntries, type ChangelogEntry } from '../src/lib/changelog';

const dir = join(__dirname, '../src/content/changelog');
const files = readdirSync(dir).filter((name) => name.endsWith('.mdx'));

describe('changelog entries', () => {
  it('finds the published entries', () => {
    expect(files.length).toBeGreaterThanOrEqual(1);
  });

  // The page reads each file's `entry` export, so a bad field would only show up as a
  // broken or missing entry on /changelog.
  it.each(files)('%s is named by date and exports a complete entry', (file) => {
    const source = readFileSync(join(dir, file), 'utf8');
    const [, fileDate] = file.match(/^(\d{4}-\d{2}-\d{2})-[a-z0-9-]+\.mdx$/) ?? [];
    expect(fileDate, 'file name must be YYYY-MM-DD-slug.mdx').toBeDefined();

    expect(source).toMatch(/^export const entry = \{$/m);
    expect(source).toMatch(/^ {2}title: '.+',?$/m);
    const date = source.match(/^ {2}date: '(\d{4}-\d{2}-\d{2})',?$/m)?.[1];
    expect(date, 'date').toBe(fileDate);

    const areas = source.match(/^ {2}areas: \[(.+)\],?$/m)?.[1];
    expect(areas, 'areas').toBeDefined();
    const names = [...areas!.matchAll(/'([^']+)'/g)].map((match) => match[1]);
    expect(names.length).toBeGreaterThanOrEqual(1);
    expect(names.length).toBeLessThanOrEqual(3);
    for (const name of names) expect(CHANGELOG_AREAS, name).toContain(name);

    const body = source.slice(source.indexOf('}') + 1).trim();
    expect(body.length, 'entry needs a body').toBeGreaterThan(0);
    // The RSS feed and the email digest render bodies as plain Markdown, so no JSX components.
    expect(body, 'body must be plain Markdown').not.toMatch(/<[A-Z]/);
  });
});

describe('changelog helpers', () => {
  const entry = (slug: string, date: string) => ({ slug, date }) as ChangelogEntry;

  it('puts the newest first and breaks ties by slug', () => {
    expect(sortEntries([entry('b', '2026-11-01'), entry('c', '2026-11-15'), entry('a', '2026-11-01')]).map(({ slug }) => slug)).toEqual(['c', 'a', 'b']);
  });

  it('formats dates the same way in every time zone', () => {
    expect(formatEntryDate('2026-11-01')).toBe('Nov 1, 2026');
    expect(formatMonth('2026-11-30')).toBe('November 2026');
  });
});

describe('changelog source for the feed and emails', () => {
  it('reads every entry, newest first, with HTML bodies', () => {
    const entries = readChangelogEntries(dir);
    expect(entries).toHaveLength(files.length);
    expect(entries[0].date >= entries[entries.length - 1].date).toBe(true);
    for (const entry of entries) expect(entry.html, entry.slug).toMatch(/^<(p|ul)>/);
  });

  it('turns Markdown into HTML with absolute links', () => {
    const html = markdownToHtml('Hi **there**, see [docs](/docs?page=mcp) and `code`.\n\n- one\n- two');
    expect(html).toContain('<strong>there</strong>');
    expect(html).toContain('<a href="https://traceiq.run/docs?page=mcp">docs</a>');
    expect(html).toContain('<code>code</code>');
    expect(html).toContain('<li>one</li>');
  });

  it('parses the entry export', () => {
    const entry = parseEntrySource('2026-11-20-x', "export const entry = {\n  title: 'It\\'s here',\n  date: '2026-11-20',\n  areas: ['MCP', 'Fixes']\n}\n\nBody.");
    expect(entry).toMatchObject({ slug: '2026-11-20-x', title: "It's here", date: '2026-11-20', areas: ['MCP', 'Fixes'], html: '<p>Body.</p>' });
  });
});
