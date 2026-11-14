# syntax=docker/dockerfile:1
# One image with both halves: the API also serves the built web client.
# Used for the hosted demo (see render.yaml); local development uses
# docker-compose.yml with the Dockerfiles in server/ and client/.

FROM node:22-bookworm-slim AS client-build
WORKDIR /client
COPY client/package*.json ./
RUN npm ci
COPY client ./
RUN npm run build

FROM node:22-bookworm-slim AS base
WORKDIR /app
# Prisma's query engine needs OpenSSL at runtime.
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*

FROM base AS server-build
COPY server/package*.json ./
COPY server/prisma ./prisma
RUN npm ci
COPY server ./
RUN npm run build && npm prune --omit=dev

FROM base AS prod
ENV NODE_ENV=production \
    CLIENT_DIST=public \
    STORAGE_DRIVER=database
COPY --from=server-build --chown=node:node /app/node_modules ./node_modules
COPY --from=server-build --chown=node:node /app/dist ./dist
COPY --from=server-build --chown=node:node /app/prisma ./prisma
COPY --from=server-build --chown=node:node /app/package.json /app/prisma.config.ts ./
COPY --from=client-build --chown=node:node /client/dist ./public
USER node
EXPOSE 5000
# Brings the database schema up to date, then starts the server.
CMD ["sh", "-c", "npx prisma db push --skip-generate && node dist/server.js"]
