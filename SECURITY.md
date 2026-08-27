# Security Policy

## Reporting a vulnerability

Please do not report security vulnerabilities in public GitHub issues, discussions, or pull requests.

Use GitHub's private vulnerability reporting page:

<https://github.com/enigma-137/trace-iq/security/advisories/new>

Include the affected component and version or commit, reproduction steps, expected impact, and any suggested mitigation. Remove secrets, access tokens, personal data, and production event payloads from the report.

We will acknowledge a complete report as soon as practical, investigate it, and coordinate remediation and disclosure with the reporter. Please allow maintainers a reasonable opportunity to address the issue before publishing details.

## Supported versions

TraceIQ is currently pre-1.0 and under active development. Security fixes are applied to the latest commit on `main`; older commits and private forks are not maintained by the project.

## Deployment responsibility

Self-hosters are responsible for TLS, network access controls, database backups, secret rotation, dependency updates, and restricting dashboard access. PostgreSQL and Redis should not be exposed to the public internet.
