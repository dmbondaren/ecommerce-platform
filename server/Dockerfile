# syntax=docker/dockerfile:1
FROM node:22-bookworm-slim AS base
WORKDIR /app
# Prisma's query engine needs OpenSSL at runtime.
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*

FROM base AS deps
COPY package*.json ./
COPY prisma ./prisma
RUN npm ci

# Development: sources are mounted as a volume and reloaded on change.
FROM deps AS dev
ENV NODE_ENV=development
COPY . .
EXPOSE 5000
CMD ["sh", "-c", "npm run db:push && npm run dev"]

FROM deps AS build
COPY . .
RUN npm run build && npm prune --omit=dev

# Production: compiled JavaScript only, running as an unprivileged user.
FROM base AS prod
ENV NODE_ENV=production
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/prisma ./prisma
COPY --from=build --chown=node:node /app/package.json ./
RUN mkdir -p uploads && chown node:node uploads
USER node
EXPOSE 5000
HEALTHCHECK --interval=30s --timeout=3s --start-period=20s \
  CMD node -e "fetch('http://127.0.0.1:5000/health').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/server.js"]
