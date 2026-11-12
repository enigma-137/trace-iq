# Remote TraceIQ MCP server (Streamable HTTP). Build from the repo root:
#   docker build -f packages/mcp-server/Dockerfile .
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY tsconfig.base.json ./
COPY packages/mcp-server/package.json packages/mcp-server/tsconfig.json ./packages/mcp-server/
WORKDIR /app/packages/mcp-server
RUN npm install --no-audit --no-fund
COPY packages/mcp-server/src ./src
RUN npm run build && npm prune --omit=dev

FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/packages/mcp-server/package.json ./
COPY --from=build /app/packages/mcp-server/node_modules ./node_modules
COPY --from=build /app/packages/mcp-server/dist ./dist
USER node
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=5s CMD node -e "fetch('http://127.0.0.1:8787/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/http.js"]
