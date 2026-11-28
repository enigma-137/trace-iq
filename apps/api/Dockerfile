# syntax=docker/dockerfile:1

# Layers are ordered so the slow steps (npm ci, Playwright + Chromium) are only redone
# when dependencies change, and the API build only when the API's own sources change.
# A dashboard-only change (deployed by Vercel) reuses every layer.

# Every workspace's package.json and nothing else. npm ci needs all of them to match
# the lockfile; copying them through this stage means editing a workspace's source
# leaves the layers below cached (BuildKit compares the copied files by content).
FROM node:22-bookworm-slim AS manifests
WORKDIR /app
COPY apps ./apps
COPY packages ./packages
RUN find apps packages -type f ! -name package.json -delete \
    && find apps packages -mindepth 1 -type d -empty -delete

FROM node:22-bookworm-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    wget \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
COPY --from=manifests /app/apps ./apps
COPY --from=manifests /app/packages ./packages

RUN npm ci --include=dev --legacy-peer-deps

# Install Playwright Chromium browser and its shared system libraries.
# Run the API workspace's own Playwright CLI so the browser build always matches
# the version the synthetic runner imports, even if another workspace depends on
# a different Playwright release.
RUN npm exec --workspace=@traceiq/api -- playwright install --with-deps chromium

# Only what the API build and runtime read: its own sources, @traceiq/types
# (resolved through tsconfig.base.json paths), and the replay JSON schema in contracts/.
COPY tsconfig.base.json ./
COPY contracts ./contracts
COPY packages/types ./packages/types
COPY apps/api ./apps/api

RUN npm --prefix apps/api run build

ENV NODE_ENV=production

EXPOSE 4000

CMD ["npm", "run", "start", "--workspace=@traceiq/api"]
