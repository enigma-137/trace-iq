# TraceIQ

TraceIQ is a developer-first behavior intelligence platform for web and mobile applications. It is designed to help teams understand user behavior, diagnose conversion issues, and prepare for high-volume analytics workloads.

## Workspace

```text
apps/
  api/          NestJS API and ingestion foundation
  dashboard/    Next.js app: public landing page (/), waitlist (/waitlist),
                docs (/docs), and the authenticated analytics dashboard (/dashboard)
packages/
  sdk-js/       Browser SDK foundation
  shared/       Shared domain models and utilities
  types/        Cross-package TypeScript contracts
  ui/           Shared UI primitives
docs/           Product, architecture, API, and deployment docs
infrastructure/ Local and future production infrastructure assets
scripts/        Developer automation
src/            traceiq/traceiq-php — PHP SDK source (Composer package lives at repo root)
```

Start with `docs/architecture.md` and `docs/architecture-diagrams.md` for the system overview. For MCP server installation and usage details, see `docs/mcp-server.md`.

## Published packages

- JavaScript SDK: [traceiq-sdk-js on npm](https://www.npmjs.com/package/traceiq-sdk-js)
- React Native SDK: [traceiq-react-native on npm](https://www.npmjs.com/package/traceiq-react-native)
- Python SDK: [traceiq-py on PyPI](https://pypi.org/project/traceiq-py/0.1.0/)
- Rust SDK: [traceiq on crates.io](https://crates.io/crates/traceiq)
- PHP SDK: [traceiq/traceiq-php on Packagist](https://packagist.org/packages/traceiq/traceiq-php) — install with `composer require traceiq/traceiq-php`. See the [PHP SDK section](#php-sdk) below.
- MCP server: [traceiq-mcp-server on npm](https://www.npmjs.com/package/traceiq-mcp-server)

## PHP SDK

Server-side TraceIQ SDK for PHP (8.1+). Pure PHP — no runtime dependencies.
Events are queued and flushed in batches, so your code never has to think about
the network.

> Note: PHP has no portable background threads, so flushing is synchronous. The
> client flushes automatically once `flush_at` events are queued and again on
> request shutdown (registered automatically).

```bash
composer require traceiq/traceiq-php
```

```php
use TraceIQ\Client;

$traceiq = new Client(
    projectId: "YOUR_PROJECT_ID",
    writeKey: "YOUR_WRITE_KEY",                  // keep server keys secret
    endpoint: "https://your-traceiq-api.example.com",  // defaults to http://localhost:4000
);

// A trustworthy revenue event, straight from your payments service:
$traceiq->capture(
    event: "payout_succeeded",
    userId: "user_123",
    properties: ["amount" => 50000, "currency" => "NGN"],
);

$traceiq->identify("user_123", traits: ["email" => "a@b.com", "kyc_tier" => 2]);
$traceiq->group("org_9", userId: "user_123", traits: ["plan" => "growth"]);

$traceiq->shutdown(); // flush before a short-lived process exits
```

| Method | Purpose |
| --- | --- |
| `capture(event, userId=null, anonymousId=null, properties=[], context=[], timestamp=null)` | Track an event. |
| `identify(userId, traits=[], timestamp=null)` | Create/update a user profile. |
| `group(organizationId, userId=null, anonymousId=null, traits=[], timestamp=null)` | Associate a user with an account. |
| `flush()` | Send everything queued now (blocks). |
| `shutdown()` | Flush and mark the client shut down. |

Options: `endpoint`, `flush_at` (20), `flush_interval` (10.0s), `max_retries` (3),
`timeout` (10.0s), `debug` (false), `on_error` (callback). `flush_interval` is
accepted for parity with the Python/Rust SDKs and reserved for a future async
transport.

Delivery is at-most-once; a batch that fails after `max_retries` is dropped and
passed to `on_error`. `properties["amount"]` (a number) powers the dashboard's
revenue metrics.

Run the suite from the repo root with `composer install && composer test`
(PHPUnit). There is no vendored Composer tree committed to Git.

## Local Setup

```bash
npm install
cp .env.example .env
docker compose up -d
npm run typecheck
npm run dev
```

This foundation intentionally avoids advanced business logic. The current goal is stable architecture, clear contracts, and documentation that future engineers can build on confidently.
