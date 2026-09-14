FROM node:22-alpine

WORKDIR /app

COPY package.json package-lock.json ./
COPY tsconfig.base.json ./
COPY apps ./apps
COPY packages ./packages
COPY contracts ./contracts

RUN npm ci --include=dev --legacy-peer-deps

RUN npm run build --workspace=@traceiq/api

ENV NODE_ENV=production

EXPOSE 4000

CMD ["npm", "run", "start", "--workspace=@traceiq/api"]
