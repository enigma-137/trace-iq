# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Install build deps
RUN apk add --no-cache python3 make g++

# Copy package files
COPY package*.json ./
COPY apps/api/package*.json ./apps/api/
COPY apps/dashboard/package*.json ./apps/dashboard/

# Install all workspace deps
RUN npm ci --include=dev --workspaces --prefer-offline

# Copy source
COPY . .

# Build Dashboard (output: standalone)
RUN npm run build --workspace=@traceiq/dashboard


# Runtime stage
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

# Install runtime deps only
COPY package*.json ./
COPY apps/dashboard/package*.json ./apps/dashboard/
RUN npm ci --omit=dev --workspace=@traceiq/dashboard --prefer-offline

# Copy standalone output
COPY --from=builder /app/apps/dashboard/.next/standalone ./
COPY --from=builder /app/apps/dashboard/.next/static ./.next/static
COPY --from=builder /app/apps/dashboard/public ./public

# Create non-root user
RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001
USER nodejs

EXPOSE 3000

CMD ["node", "server.js"]