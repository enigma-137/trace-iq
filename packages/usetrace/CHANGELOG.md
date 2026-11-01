# Changelog

## 0.3.1

- Fix the Next.js setup breaking `app/layout.tsx`. The installer wrapped the first `{ children }` it found, which is the function parameter in `RootLayout({ children }: ...)`, so the layout no longer compiled ("Parsing ecmascript source code failed"). It now wraps only the `{children}` rendered in JSX.
- Running setup again repairs a layout broken by an earlier version, then wraps the JSX correctly.
- Wrap `<body className="...">` layouts too; only a bare `<body>` was recognised before.

## 0.3.0

- Add `traceiq sourcemaps upload` to upload JavaScript source maps for a release.
- Add `traceiq sourcemaps list` to inspect releases with uploaded source maps.
- Support CI authentication with a personal access token scoped to `sourcemaps:write`.
