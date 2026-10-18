# Contributing to TraceIQ

Thanks for helping improve TraceIQ. Contributions of code, tests, documentation, SDK fixes, and reproducible bug reports are welcome.

## Before you start

- Search existing issues and pull requests before opening a duplicate.
- Use an issue to discuss substantial features, schema changes, or architectural changes before investing in an implementation.
- Use GitHub's private vulnerability reporting flow for security issues; do not open a public issue. See [SECURITY.md](SECURITY.md).

## Development setup

Follow the [local quickstart](README.md#local-quickstart). The main requirements are Node.js 22, npm 10+, and Docker Compose. A Supabase project is only required when testing account, team, invitation, or 2FA behavior.

Install the monorepo dependencies with:

```bash
npm ci --legacy-peer-deps
```

The legacy peer-dependency mode is currently required because of an unrelated React Native workspace peer conflict.

## Making a change

1. Fork the repository and create a focused branch from `main`.
2. Keep changes scoped; avoid mixing refactors with behavioral changes.
3. Add or update tests for changed behavior.
4. Update public documentation when an API, environment variable, or workflow changes.
5. Never commit `.env` files, credentials, database dumps, customer data, or production logs.

Keep domain logic inside its feature or NestJS module. Put reusable public contracts in `packages/types` or a domain-local interface. Migrations must be deterministic, forward-only SQL files in `apps/api/migrations` and must preserve existing installations.

## Validation

Run the checks relevant to your change:

```bash
npm run typecheck
npm test --workspace=@traceiq/api
npm test --workspace=@traceiq/dashboard
npm test --workspace=traceiq-cli
npm run build
```

For dashboard UI changes, also run the browser smoke tests. They check that
public pages render on the server without errors and that dark mode styles
exist. The first run needs `npx playwright install chromium` in
`apps/dashboard`. Against a dev server you already have running:

```bash
cd apps/dashboard
PLAYWRIGHT_BASE_URL=http://localhost:3000 npm run test:e2e
```

Without `PLAYWRIGHT_BASE_URL`, the tests build the dashboard and serve it on port 3100.

For PHP SDK changes:

```bash
composer install
composer test
```

Also run the package-specific test or build command for any SDK you modify.

## Pull requests

In the pull request description, include:

- What changed and why
- User-visible or API behavior changes
- Migration or deployment impact
- Tests and manual checks performed
- Screenshots for dashboard changes

Maintainers may ask for a smaller scope, additional tests, or documentation before merging. By contributing, you agree that your contribution is licensed under the repository's MIT License.
