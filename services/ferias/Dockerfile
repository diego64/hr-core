# syntax=docker/dockerfile:1.7
#
# Multi-stage build do Ferias Service. Mesmo padrão do funcionario/auth:
#   1. base       — Node 22 alpine + pnpm via corepack
#   2. deps       — fetch do lockfile para o cache do pnpm
#   3. build      — typecheck + emissão JS em /app/services/ferias/dist
#   4. prod-deps  — somente production deps offline
#   5. runtime    — imagem final mínima, non-root

FROM node:22.23.0-alpine AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable && corepack prepare pnpm@11.0.9 --activate
WORKDIR /app

FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json .npmrc ./
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm fetch --frozen-lockfile

FROM deps AS build
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc tsconfig.json ./
COPY services/ferias/package.json services/ferias/
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile --offline --ignore-scripts \
      --filter @hr-core/ferias... \
      --config.confirmModulesPurge=false

COPY services/ferias/tsconfig.json services/ferias/tsconfig.build.json services/ferias/
COPY services/ferias/src services/ferias/src

RUN pnpm --filter @hr-core/ferias typecheck
RUN pnpm --filter @hr-core/ferias build

FROM deps AS prod-deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY services/ferias/package.json services/ferias/
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile --offline --prod --ignore-scripts \
      --filter @hr-core/ferias... \
      --config.confirmModulesPurge=false

FROM node:22.23.0-alpine AS runtime
ENV NODE_ENV=production
ENV PORT=3003
ENV HOST=0.0.0.0

WORKDIR /app

COPY --from=prod-deps --chown=node:node /app/node_modules /app/node_modules
COPY --from=prod-deps --chown=node:node /app/services/ferias/node_modules /app/services/ferias/node_modules

COPY --from=build --chown=node:node /app/services/ferias/dist /app/services/ferias/dist
COPY --from=build --chown=node:node /app/services/ferias/package.json /app/services/ferias/package.json
# AGPL-3.0 exige distribuição com a licença
COPY --chown=node:node services/ferias/LICENSE /app/services/ferias/LICENSE

USER node
WORKDIR /app/services/ferias
EXPOSE 3003

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
    CMD wget --quiet --tries=1 --spider http://127.0.0.1:${PORT}/health || exit 1

CMD ["node", "--import", "./dist/tracing.js", "dist/server.js"]
