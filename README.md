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
```

Start with `docs/architecture.md` and `docs/architecture-diagrams.md` for the system overview. For MCP server installation and usage details, see `docs/mcp-server.md`.

## Published packages

- JavaScript SDK: [traceiq-sdk-js on npm](https://www.npmjs.com/package/traceiq-sdk-js)
- React Native SDK: [traceiq-react-native on npm](https://www.npmjs.com/package/traceiq-react-native)
- Python SDK: [traceiq-py on PyPI](https://pypi.org/project/traceiq-py/0.1.0/)
- Rust SDK: [traceiq on crates.io](https://crates.io/crates/traceiq)
- MCP server: [traceiq-mcp-server on npm](https://www.npmjs.com/package/traceiq-mcp-server)

## Local Setup

```bash
npm install
cp .env.example .env
docker compose up -d
npm run typecheck
npm run dev
```

This foundation intentionally avoids advanced business logic. The current goal is stable architecture, clear contracts, and documentation that future engineers can build on confidently.
