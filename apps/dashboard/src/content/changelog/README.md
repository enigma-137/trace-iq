# Changelog entries

Each `.mdx` file here is one entry on [/changelog](https://traceiq.run/changelog). The page
picks up every file automatically, newest first, and groups them by month. The file name
(minus `.mdx`) is the entry's link anchor, e.g. `/changelog#2026-11-15-linear-and-github`.

## What gets an entry

The changelog is **selected, not exhaustive**. Write an entry when users would notice or care:

- a new feature, integration or MCP tool
- a visible improvement to an existing one
- a fix for something users ran into (as a **Fixed:** line inside the related entry, or a
  `Fixes` entry when there are several)

Leave out refactors, dependency bumps, internal tooling, tests, copy tweaks and admin-only
changes. Developer-facing package details belong in each package's `CHANGELOG.md`; link to the
docs from the entry instead of repeating them.

Group small related changes into one entry rather than writing several thin ones.

## Adding an entry

Add the file in the same pull request as the change, so it ships when the change does.
Name it `YYYY-MM-DD-short-slug.mdx`, using the date it ships:

```mdx
export const entry = {
  title: 'What people can now do, in plain words',
  date: '2026-11-20',
  areas: ['Dashboard']
}

One or two sentences on what changed and why it helps.

- Smaller related improvements as bullets.
- **Fixed:** what was broken, from the user's side.

[Read the docs →](/docs?page=...)
```

`areas` takes one to three of: `Dashboard`, `Integrations`, `Ask TraceIQ`, `MCP`, `Alerts`,
`Errors`, `SDKs`, `Fixes` (see `CHANGELOG_AREAS` in `src/lib/changelog.ts`).

Write for users, not reviewers: lead with the benefit, skip file names and internals, and
keep each entry short enough to read in under a minute.

`tests/changelog.test.ts` checks every entry's file name, fields and areas.
