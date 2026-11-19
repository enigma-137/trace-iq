/** Product areas a changelog entry can be tagged with. Keep this list short so the tags stay useful. */
export const CHANGELOG_AREAS = [
  'Dashboard',
  'Integrations',
  'Ask TraceIQ',
  'MCP',
  'Alerts',
  'Errors',
  'SDKs',
  'Fixes'
] as const;

export type ChangelogArea = (typeof CHANGELOG_AREAS)[number];

/** The `entry` object each `src/content/changelog/<date>-<slug>.mdx` exports. */
export type ChangelogEntryMeta = {
  /** A benefit, in plain words: what people can now do. */
  title: string;
  /** Release date, YYYY-MM-DD. */
  date: string;
  /** One to three areas from CHANGELOG_AREAS. */
  areas: ChangelogArea[];
};

export type ChangelogEntry = ChangelogEntryMeta & { slug: string };

/** Newest first; entries on the same day keep a stable, alphabetical order. */
export function sortEntries<T extends ChangelogEntry>(entries: T[]): T[] {
  return [...entries].sort((a, b) => b.date.localeCompare(a.date) || a.slug.localeCompare(b.slug));
}

export function formatEntryDate(date: string) {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' });
}

export function formatMonth(date: string) {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString('en-US', { year: 'numeric', month: 'long', timeZone: 'UTC' });
}
