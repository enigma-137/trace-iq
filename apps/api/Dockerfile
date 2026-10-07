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

# Install Playwright Chromium browser and its shared system libraries
RUN npx playwright install --with-deps chromium

RUN npm run build --workspace=@traceiq/api

ENV NODE_ENV=production

EXPOSE 4000

CMD ["npm", "run", "start", "--workspace=@traceiq/api"]
