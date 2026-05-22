# Production Dockerfile for ingestion-service.
# Built from the monorepo root:
#   docker build -f services/ingestion-service/Dockerfile .
#
# esbuild bundles the entire service into a single dist/index.js with all
# dependencies inlined — no node_modules needed at runtime.

# ───── 1. build stage ────────────────────────────────────────────────────────
FROM node:22-bookworm-slim AS build
WORKDIR /repo

RUN corepack enable && corepack prepare pnpm@11.1.3 --activate

COPY . .
RUN pnpm install --frozen-lockfile

# esbuild bundle → services/ingestion-service/dist/index.js
RUN pnpm --filter ingestion-service build

# ───── 2. runtime stage ──────────────────────────────────────────────────────
FROM node:22-bookworm-slim AS runtime
WORKDIR /app

RUN apt-get update \
 && apt-get install -y --no-install-recommends ffmpeg python3 ca-certificates curl \
 && curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp \
 && chmod +x /usr/local/bin/yt-dlp \
 && apt-get purge -y --auto-remove curl \
 && rm -rf /var/lib/apt/lists/*

COPY --from=build /repo/services/ingestion-service/dist/index.js ./index.js

ENV NODE_ENV=production \
    PORT=3001 \
    INGESTION_TMP_DIR=/tmp/shaq-os/ingestion

EXPOSE 3001
CMD ["node", "index.js"]
