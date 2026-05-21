# SHAQ OS ingestion-service — STUB Dockerfile.
# This builds the service in isolation. For a production monorepo Docker
# build that fully respects workspace deps, see services/README (TBD).

FROM node:20-alpine AS build
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@11.1.3 --activate
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json ./
COPY services/ingestion-service ./services/ingestion-service
RUN pnpm install --frozen-lockfile --filter ingestion-service...
RUN pnpm --filter ingestion-service build

FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/services/ingestion-service/dist ./dist
COPY --from=build /app/services/ingestion-service/node_modules ./node_modules
COPY --from=build /app/services/ingestion-service/package.json ./package.json
EXPOSE 3001
CMD ["node", "dist/index.js"]
