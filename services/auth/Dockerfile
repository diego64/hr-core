# syntax=docker/dockerfile:1.7
#
# Multi-stage build do Auth Service. Espelha o padrão do api-gateway:
#   1. base       — Node 22 alpine + pnpm via corepack
#   2. deps       — fetch do lockfile para o cache do pnpm
#   3. build      — typecheck + emissão JS em /app/services/auth/dist
#   4. prod-deps  — somente production deps offline
#   5. runtime    — imagem final mínima, non-root
#
# Buildar (a partir da raiz do monorepo):
#   docker build -f services/auth/Dockerfile -t hr-core/auth:dev .

# -----------------------------------------------------------------------------
# 1) Base
# -----------------------------------------------------------------------------
FROM node:22.22.3-alpine AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable && corepack prepare pnpm@11.0.9 --activate
WORKDIR /app

# -----------------------------------------------------------------------------
# 2) Fetch — popula o store do pnpm (cacheável)
# -----------------------------------------------------------------------------
FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json .npmrc ./
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm fetch --frozen-lockfile

# -----------------------------------------------------------------------------
# 3) Build — instala dev deps offline e emite JS
# -----------------------------------------------------------------------------
FROM deps AS build
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc tsconfig.json ./
COPY services/auth/package.json services/auth/
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile --offline --ignore-scripts \
      --filter @hr-core/auth... \
      --config.confirmModulesPurge=false

COPY services/auth/tsconfig.json services/auth/tsconfig.build.json services/auth/
COPY services/auth/src services/auth/src

RUN pnpm --filter @hr-core/auth typecheck
RUN pnpm --filter @hr-core/auth build

# -----------------------------------------------------------------------------
# 4) Prod deps
# -----------------------------------------------------------------------------
FROM deps AS prod-deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY services/auth/package.json services/auth/
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile --offline --prod --ignore-scripts \
      --filter @hr-core/auth... \
      --config.confirmModulesPurge=false

# -----------------------------------------------------------------------------
# 5) Runtime
# -----------------------------------------------------------------------------
FROM node:22.22.3-alpine AS runtime
ENV NODE_ENV=production
ENV PORT=4000
ENV HOST=0.0.0.0

WORKDIR /app

COPY --from=prod-deps --chown=node:node /app/node_modules /app/node_modules
COPY --from=prod-deps --chown=node:node /app/services/auth/node_modules /app/services/auth/node_modules

COPY --from=build --chown=node:node /app/services/auth/dist /app/services/auth/dist
COPY --from=build --chown=node:node /app/services/auth/package.json /app/services/auth/package.json
# AGPL-3.0 exige distribuição com a licença
COPY --chown=node:node services/auth/LICENSE /app/services/auth/LICENSE

USER node
WORKDIR /app/services/auth
EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
    CMD wget --quiet --tries=1 --spider http://127.0.0.1:${PORT}/health || exit 1

CMD ["node", "--import", "./dist/tracing.js", "dist/server.js"]
