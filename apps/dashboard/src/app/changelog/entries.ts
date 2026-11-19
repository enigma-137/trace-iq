import type { ComponentType } from 'react';
import { sortEntries, type ChangelogEntry, type ChangelogEntryMeta } from '@/lib/changelog';

// Every `.mdx` file in src/content/changelog is an entry; webpack bundles them at build time,
// so publishing one is just adding a file. The file name (minus .mdx) is its anchor on the page.
const entryModules = require.context('../../content/changelog', false, /^\.\/[^/]+\.mdx$/);

export type LoadedEntry = ChangelogEntry & { Body: ComponentType };

export const entries: LoadedEntry[] = sortEntries(
  entryModules.keys().map((key) => {
    const mod = entryModules<{ entry: ChangelogEntryMeta; default: ComponentType }>(key);
    return { slug: key.replace(/^\.\//, '').replace(/\.mdx$/, ''), ...mod.entry, Body: mod.default };
  })
);
