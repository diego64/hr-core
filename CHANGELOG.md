# Changelog

Todas as mudanças notáveis deste projeto serão documentadas neste arquivo.

O formato é baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/) e o projeto adere ao [Versionamento Semântico](https://semver.org/lang/pt-BR/spec/v2.0.0.html).

> **Como manter:** entradas novas vão sempre na seção `[Não publicado]`. Quando uma release é cortada, o conteúdo de `[Não publicado]` move para uma nova seção `[X.Y.Z] — YYYY-MM-DD`. Categorias seguem Keep a Changelog: **Adicionado** · **Alterado** · **Descontinuado** · **Removido** · **Corrigido** · **Segurança**.
>
> Sempre referencie o **commit / PR** (`#123`) e, se aplicável, a **issue** (`HR-42`). Itens marcados com 🔒 são correções de segurança e devem cross-linkar com [`SECURITY.md`](./SECURITY.md).
>
> No futuro, este arquivo pode ser gerado por `semantic-release` a partir dos commits Conventional. Enquanto isso, é mantido manualmente.

---

## [Não publicado]

### Adicionado

#### `api-gateway`

- Estrutura inicial do serviço com Fastify 5, TypeScript estrito (`strict: true`, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, `verbatimModuleSyntax`)
- Validação fail-fast de env via Zod em `src/config/env.ts`
- Autenticação JWT RS256 com JWKS remoto (cache 10min, cooldown 30s) em `src/plugins/auth.ts` — decorator `fastify.authenticate`
- Autorização por role em `src/plugins/rbac.ts` — decorator `fastify.requireRole(role|role[])`
- Rate limit por IP (in-memory, `@fastify/rate-limit`) com 429 padronizado em RFC 7807
- CORS configurável via `CORS_ORIGINS` (allowlist) / `CORS_CREDENTIALS` / `CORS_MAX_AGE`
- Métricas Prometheus em `GET /metrics` (`fastify-metrics` + `prom-client`) — histogram/summary por rota e status
- Tracing OpenTelemetry via OTLP HTTP (`tracing.ts` preloadado com `node --import`), instrumentações `http` / `undici` / `pino` ligadas; `service.name` e `service.version` automaticamente populados
- Proxy HTTP via `@fastify/http-proxy` para os 4 microsserviços downstream (funcionário, férias, avaliação, folha-de-pagamento), com rewrite `/api/v1/<servico>` → `/<servico>` e propagação de `x-trace-id` / `x-user-id` / `x-user-roles`
- Error handler global em `src/middlewares/error-handler.ts` — todas as respostas de erro em **RFC 7807** (`application/problem+json`) com `traceId`; branch dedicado para `ZodError` mapeando para 400 com `fieldErrors`
- Health/ready probes (`/health`, `/ready`) com schemas Zod tipados
- Logger Pino estruturado com `base: { service: 'api-gateway' }` e `genReqId` que honra header `x-trace-id` propagado
- **Documentação OpenAPI 3.1 em `/docs`** via `@fastify/swagger` + `@fastify/swagger-ui` + `fastify-type-provider-zod`; `transformObject` injeta catch-all canônicas para rotas de proxy (decisão: gateway documenta apenas próprio contrato, downstreams publicam suas OpenAPIs)
- Envs `SWAGGER_ENABLED` e `SWAGGER_ROUTE_PREFIX`
- Stack local de observabilidade via `docker-compose.yml`: api-gateway + mock-backend + Tempo + Prometheus + Grafana
- Dashboard inicial provisionado no Grafana (`docker/dashboards/api-gateway.json`) com 8 painéis: req/s, erros %, eventloop, uptime, req/s por rota, latência p50/p95/p99, eventloop min/mean/p99, memória
- Datasources Grafana provisionados com **UID explícito** (`prometheus`, `tempo`) — corrige referência cruzada de `tracesToMetrics` / `serviceMap`
- Suite de testes unitários (Vitest 4) cobrindo health, auth, rate-limit, CORS, metrics — **12 testes em 5 arquivos**
- Suite E2E (`vitest.e2e.config.ts`) que sobe a stack via compose, espera healthcheck e valida o contrato HTTP exposto
- Dockerfile multi-stage (deps → build → prod-deps → runtime) baseado em `node:22-alpine` com `HEALTHCHECK` chamando `/health`
- README do serviço (`services/api-gateway/README.md`) com 18 seções, incluindo anatomia dos módulos, fluxo de requisição, política de erros, troubleshooting do pipeline de métricas/traces e procedimento de reset do Grafana

#### Tooling do monorepo (raiz)

- Workspace pnpm (`pnpm-workspace.yaml`) configurado
- ESLint 10 (flat config) com `@typescript-eslint` em modo `recommendedTypeChecked` + `eslint-config-prettier`
- Prettier 3 (no-semi, single quotes, trailing commas, width 100)
- Husky 9 — hooks `commit-msg` (commitlint) e `pre-commit` (lint-staged)
- commitlint com `@commitlint/config-conventional` + enum de escopos (`gateway`, `auth`, `ferias`, `kafka`, `deps`...)
- Template de mensagem de commit em `.gitmessage.txt`, ativado automaticamente via script `prepare` do `package.json`
- Template de Pull Request em `.github/pull_request_template.md` (PT-BR, com checklist de conformidade com CLAUDE.md)
- Templates de Issue em `.github/ISSUE_TEMPLATE/` (form-based YAML): bug report + feature request
- `.github/CODEOWNERS` com mapeamento por path para reviewers automáticos
- `CONTRIBUTING.md` documentando fluxo branch → commit → PR → review → merge
- `SECURITY.md` com política de disclosure, canal privado, SLAs por severidade

### Alterado

_Nada por enquanto._

### Corrigido

_Nada por enquanto._

### Segurança

_Nada por enquanto._

---

## [0.1.0] — 2026-05-12

### Adicionado

- Estrutura inicial do monorepo (`commit 7d2743a`):
  - `package.json` raiz com scripts `typecheck`, `test`, `build`, `lint`, `format`
  - `tsconfig.json` base compartilhado
  - `pnpm-workspace.yaml` apontando para `services/*` e `packages/*`
  - `commitlint.config.cjs` com Conventional Commits e enum de escopos
  - `CLAUDE.md` documentando arquitetura (microsserviços + Kafka + MongoDB driver nativo), stack tech, princípios inegociáveis (gateway sem regra de negócio, sem ORM, sem `npm`/`yarn`, eventos após persistência) e regras de negócio críticas (férias com 1 ano de empresa, sem sobreposição)

---

## Convenções deste arquivo

### Por que categorias específicas

- **Adicionado** — novas features visíveis ao consumidor (rotas, eventos, métricas, contratos)
- **Alterado** — mudanças em comportamento existente; se quebrar contrato, prefixar com `**BREAKING:**`
- **Descontinuado** — funcionalidade que ainda existe mas será removida; deve listar a versão de remoção planejada
- **Removido** — funcionalidade que foi removida nesta release
- **Corrigido** — bugs resolvidos
- **Segurança** — vulnerabilidades corrigidas; preceder com 🔒 e cross-linkar `SECURITY.md`

### Como redigir uma entrada

- Voz **passada**: "Adicionado X", "Corrigido Y", "Removido Z"
- Foco em **valor pro consumidor**, não em arquivo modificado. ❌ "Refatorado `auth.ts`" · ✅ "Reduzido tempo de validação de JWT de 5ms para 0.8ms via cache de JWKS"
- Sempre **referenciar PR ou commit**: `(#42)` ou `(7d2743a)`
- Para breaking change, anexar **bloco de migração**:
  ```
  - **BREAKING:** removido `AUTH_PUBLIC_KEY` em favor de `AUTH_JWKS_URL`. Migração:
    1. Configure `AUTH_JWKS_URL` apontando para `https://auth/.well-known/jwks.json`
    2. Remova `AUTH_PUBLIC_KEY` do `.env`
    3. Restart do gateway
  ```

### Quando incrementar a versão

| Mudança                                             | Bump   |
| --------------------------------------------------- | ------ |
| Bug fix sem mudança de contrato                     | patch  |
| Feature nova, retrocompatível                       | minor  |
| Breaking change (contrato HTTP, evento Kafka, env)  | major  |
| Mudança apenas em código interno sem efeito externo | nenhum |

Em pré-1.0 (`0.x.y`), bumps de `minor` podem incluir breaking change (consistente com SemVer). Após 1.0, breaking exige bump major.

### Geração automática (futuro)

Quando `semantic-release` for adotado:

- Commits `feat:` viram entrada **Adicionado**
- Commits `fix:` viram **Corrigido**
- Commits `perf:` viram **Alterado** com tag de performance
- Footer `BREAKING CHANGE:` força bump major + bloco de migração
- Notas de segurança devem usar tag `[security]` no scope para serem destacadas

Até lá, mantido **manualmente** — atualizar `[Não publicado]` no mesmo PR da mudança.
