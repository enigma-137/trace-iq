# Contributing

## Engineering Principles

- Use TypeScript across apps and packages.
- Keep domain logic inside feature or module boundaries.
- Prefer explicit interfaces before implementation.
- Keep ingestion, analytics, replay, and AI concerns loosely coupled.
- Add tests with each real behavior change once implementation begins.

## Branch Workflow

1. Create a focused branch for the change.
2. Update or add relevant interfaces and docs.
3. Run type checks and package-specific validation.
4. Open a pull request with scope, risk, and verification notes.

## Code Style

- Use strict TypeScript.
- Keep public contracts in `packages/types` or domain-local `interfaces` files.
- Avoid adding provider-specific logic directly to domain modules.
- Document architecture decisions in `docs/architecture.md` or a dedicated ADR once ADRs are introduced.
