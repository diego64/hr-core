# syntax=docker/dockerfile:1.7
#
# Multi-stage build do Folha de Pagamento Service. Mesmo padrão do ferias/funcionario:
#   1. base       — Node 22 alpine + pnpm via corepack
#   2. deps       — fetch do lockfile para o cache do pnpm
#   3. build      — typecheck + emissão JS em /app/services/folha-pagamento/dist
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
COPY services/folha-pagamento/package.json services/folha-pagamento/
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile --offline --ignore-scripts \
      --filter @hr-core/folha-pagamento... \
      --config.confirmModulesPurge=false

COPY services/folha-pagamento/tsconfig.json services/folha-pagamento/tsconfig.build.json services/folha-pagamento/
COPY services/folha-pagamento/src services/folha-pagamento/src

RUN pnpm --filter @hr-core/folha-pagamento typecheck
RUN pnpm --filter @hr-core/folha-pagamento build

FROM deps AS prod-deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY services/folha-pagamento/package.json services/folha-pagamento/
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile --offline --prod --ignore-scripts \
      --filter @hr-core/folha-pagamento... \
      --config.confirmModulesPurge=false

FROM node:22.23.0-alpine AS runtime
ENV NODE_ENV=production
ENV PORT=3004
ENV HOST=0.0.0.0

WORKDIR /app

COPY --from=prod-deps --chown=node:node /app/node_modules /app/node_modules
COPY --from=prod-deps --chown=node:node /app/services/folha-pagamento/node_modules /app/services/folha-pagamento/node_modules

COPY --from=build --chown=node:node /app/services/folha-pagamento/dist /app/services/folha-pagamento/dist
COPY --from=build --chown=node:node /app/services/folha-pagamento/package.json /app/services/folha-pagamento/package.json
# AGPL-3.0 exige distribuição com a licença
COPY --chown=node:node services/folha-pagamento/LICENSE /app/services/folha-pagamento/LICENSE

USER node
WORKDIR /app/services/folha-pagamento
EXPOSE 3004

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
    CMD wget --quiet --tries=1 --spider http://127.0.0.1:${PORT}/health || exit 1

CMD ["node", "--import", "./dist/tracing.js", "dist/server.js"]
