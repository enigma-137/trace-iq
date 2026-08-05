# Environment Setup

## Prerequisites

- Node.js 20+
- npm 10+
- Docker Desktop or compatible Docker engine
- PostgreSQL client tools, optional but useful

## First Run

```bash
npm install
cp .env.example .env
docker compose up -d
npm run typecheck
```

## Local Services

- API: `http://localhost:4000`
- Dashboard app (landing page `/`, waitlist `/waitlist`, docs `/docs`, dashboard `/dashboard`): `http://localhost:3000`
- PostgreSQL: `localhost:5432`
- Redis: `localhost:6379`

## Environment Variables

See `.env.example` for required local configuration.
