# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Install build deps
RUN apk add --no-cache python3 make g++

# Copy package files
COPY package*.json ./
COPY apps/api/package*.json ./apps/api/
COPY apps/dashboard/package*.json ./apps/dashboard/

# Install all workspace deps (including dev for build)
RUN npm ci --include=dev --workspaces --prefer-offline

# Copy source
COPY . .

# Build API
RUN npm run build --workspace=@traceiq/api


# Runtime stage
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

# Install runtime deps only
COPY package*.json ./
COPY apps/api/package*.json ./apps/api/
COPY apps/dashboard/package*.json ./apps/dashboard/
RUN npm ci --omit=dev --workspaces --prefer-offline

# Copy built API from builder
COPY --from=builder /app/apps/api/dist ./apps/api/dist

# Copy any runtime assets (migrations, etc.)
COPY --from=builder /app/apps/api/migrations ./apps/api/migrations

# Create non-root user
RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001
USER nodejs

EXPOSE 4000

# Run migrations then start
CMD ["sh", "-c", "cd /app/apps/api && npm run migrate && node dist/main.js"]