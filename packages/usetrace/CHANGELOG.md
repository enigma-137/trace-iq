# Changelog

## 0.4.0

- Add `traceiq import posthog <file>` to import events from a PostHog export (JSON Lines, a JSON array, or an API response with `results`). Page views, identifies and aliases are mapped to their TraceIQ equivalents, custom events keep their names, and PostHog-internal events are skipped and listed. `--dry-run` shows what would be imported without sending anything.
- `traceiq import posthog --posthog-key phx_... --posthog-project <id> --since <date>` pulls events directly from PostHog using PostHog file download exports, one week at a time, then imports them. Events TraceIQ skips are excluded from the export, since PostHog bills exports per row. Gzipped JSON Lines files can also be imported.
- Imports authenticate with a personal access token (`imports:write` scope) and go through the API's import endpoint, so events keep their original location instead of the importing machine's, and historical events don't trigger webhooks.
- Install current SDK versions: `traceiq-sdk-js@^0.4.0` (was pinned to `^0.1.7`) and `traceiq-node@^0.3.0`.
- Node.js apps now get the server SDK, `traceiq-node`, instead of the browser SDK. The generated `traceiq.js`/`traceiq.ts` creates one shared client, or `null` when `TRACEIQ_PROJECT_ID`/`TRACEIQ_WRITE_KEY` are missing, so the app still starts. It uses `require` or `import` to match the package's module type and always passes the endpoint (`TRACEIQ_API_URL`, or `TRACEIQ_ENDPOINT`).
- `inspect` looks for `traceiq-node` in Node apps and recommends it when only the browser SDK is installed.
- The Next.js provider is imported with a relative path, so projects without an `@/` alias build.

## 0.3.1

- Fix the Next.js setup breaking `app/layout.tsx`. The installer wrapped the first `{ children }` it found, which is the function parameter in `RootLayout({ children }: ...)`, so the layout no longer compiled ("Parsing ecmascript source code failed"). It now wraps only the `{children}` rendered in JSX.
- Running setup again repairs a layout broken by an earlier version, then wraps the JSX correctly.
- Wrap `<body className="...">` layouts too; only a bare `<body>` was recognised before.

## 0.3.0

- Add `traceiq sourcemaps upload` to upload JavaScript source maps for a release.
- Add `traceiq sourcemaps list` to inspect releases with uploaded source maps.
- Support CI authentication with a personal access token scoped to `sourcemaps:write`.
