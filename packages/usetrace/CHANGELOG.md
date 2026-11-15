# Changelog

## Unreleased

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
