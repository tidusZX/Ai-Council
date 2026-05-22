# Production Dockerfile for analysis-service.
# Built from the monorepo root:
#   docker build -f services/analysis-service/Dockerfile .
#
# esbuild bundles the whole service into a single dist/index.js. No
# ffmpeg/yt-dlp here — analysis-service is pure HTTP to Anthropic +
# Supabase Storage fetches.

# ───── 1. build stage ────────────────────────────────────────────────────────
FROM node:22-bookworm-slim AS build
WORKDIR /repo
RUN corepack enable && corepack prepare pnpm@11.1.3 --activate
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter analysis-service build

# ───── 2. runtime stage ──────────────────────────────────────────────────────
FROM node:22-bookworm-slim AS runtime
WORKDIR /app
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates \
 && rm -rf /var/lib/apt/lists/*

COPY --from=build /repo/services/analysis-service/dist/index.js ./index.js

ENV NODE_ENV=production \
    PORT=3002

EXPOSE 3002
CMD ["node", "index.js"]
