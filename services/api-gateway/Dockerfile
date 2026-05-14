# syntax=docker/dockerfile:1.7
#
# Multi-stage build para o API Gateway do HR Core.
# Estágios:
#   1. base       — Node 22 alpine + pnpm via corepack (compartilhado)
#   2. deps       — fetch das dependências para o cache do pnpm
#   3. build      — typecheck + emissão JS em /app/services/api-gateway/dist
#   4. prod-deps  — somente production deps, instaladas offline a partir do cache
#   5. runtime    — imagem final mínima, non-root, com apenas dist/ + node_modules de prod
#
# Buildar (a partir da raiz do monorepo):
#   docker build -f services/api-gateway/Dockerfile -t hr-core/api-gateway:dev .

# -----------------------------------------------------------------------------
# 1) Base
# -----------------------------------------------------------------------------
FROM node:22.22.2-alpine AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable && corepack prepare pnpm@11.0.9 --activate
WORKDIR /app

# -----------------------------------------------------------------------------
# 2) Fetch — popula o store do pnpm de acordo com o lockfile (cacheável)
# -----------------------------------------------------------------------------
FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json .npmrc ./
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm fetch --frozen-lockfile

# -----------------------------------------------------------------------------
# 3) Build — instala dependências de dev e emite o JS
# -----------------------------------------------------------------------------
FROM deps AS build
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc tsconfig.json ./
COPY services/api-gateway/package.json services/api-gateway/
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile --offline --ignore-scripts \
      --filter @hr-core/api-gateway... \
      --config.confirmModulesPurge=false

COPY services/api-gateway/tsconfig.json services/api-gateway/tsconfig.build.json services/api-gateway/
COPY services/api-gateway/src services/api-gateway/src

RUN pnpm --filter @hr-core/api-gateway typecheck
RUN pnpm --filter @hr-core/api-gateway build

# -----------------------------------------------------------------------------
# 4) Prod deps — apenas o subset necessário em runtime
# -----------------------------------------------------------------------------
FROM deps AS prod-deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY services/api-gateway/package.json services/api-gateway/
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile --offline --prod --ignore-scripts \
      --filter @hr-core/api-gateway... \
      --config.confirmModulesPurge=false

# -----------------------------------------------------------------------------
# 5) Runtime — imagem final
# -----------------------------------------------------------------------------
FROM node:22.22.2-alpine AS runtime
ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0

# usuário não-root pré-existente na imagem oficial: uid/gid 1000
WORKDIR /app

# copia node_modules de produção (hoisted no root + symlinks no service)
COPY --from=prod-deps --chown=node:node /app/node_modules /app/node_modules
COPY --from=prod-deps --chown=node:node /app/services/api-gateway/node_modules /app/services/api-gateway/node_modules

# código compilado
COPY --from=build --chown=node:node /app/services/api-gateway/dist /app/services/api-gateway/dist
COPY --from=build --chown=node:node /app/services/api-gateway/package.json /app/services/api-gateway/package.json

USER node
WORKDIR /app/services/api-gateway
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
    CMD wget --quiet --tries=1 --spider http://127.0.0.1:${PORT}/health || exit 1

CMD ["node", "--import", "./dist/tracing.js", "dist/server.js"]
