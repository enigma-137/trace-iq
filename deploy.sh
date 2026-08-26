#!/usr/bin/env bash
set -euo pipefail

# TraceIQ VPS Deployment Script
# Run on the VPS after cloning the repo

REPO_DIR="/opt/traceiq"
cd "$REPO_DIR"

echo "🔄 Pulling latest changes..."
git pull origin main

echo "📦 Building and starting services..."
docker compose up -d --build --remove-orphans

echo "🏥 Waiting for health checks..."
sleep 10

echo "📋 Service status:"
docker compose ps

echo "🩺 API health:"
curl -sf https://api.traceiq.run/health | jq . || echo "API not responding yet"

echo "🩺 Dashboard health:"
curl -sf https://traceiq.run | head -c 200 && echo "..."

echo "✅ Deploy complete"