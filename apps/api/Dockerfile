FROM node:22-bookworm-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    wget \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
COPY tsconfig.base.json ./
COPY apps ./apps
COPY packages ./packages
COPY contracts ./contracts

RUN npm ci --include=dev --legacy-peer-deps

# Install Playwright Chromium browser and its shared system libraries.
# Run the API workspace's own Playwright CLI so the browser build always matches
# the version the synthetic runner imports, even if another workspace depends on
# a different Playwright release.
RUN npm exec --workspace=@traceiq/api -- playwright install --with-deps chromium

RUN npm --prefix apps/api run build

ENV NODE_ENV=production

EXPOSE 4000

CMD ["npm", "run", "start", "--workspace=@traceiq/api"]
