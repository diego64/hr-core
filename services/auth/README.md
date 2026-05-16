# @hr-core/auth

> Auth Service do HR Core — emissão e validação de JWT RS256, gestão de usuários e refresh tokens com rotation.

Responsável **exclusivamente** por:

- Criação e autenticação de usuários (`/auth/register`, `/auth/login`)
- Rotação segura de refresh tokens com detecção de reuso (`/auth/refresh`)
- Encerramento de sessão (`/auth/logout`)
- Publicação da chave pública via JWKS para os demais serviços (`/.well-known/jwks.json`)

**Não** valida JWT de requests autenticadas — isso é responsabilidade de cada serviço (Zero Trust). O gateway baixa o JWKS daqui e verifica localmente.

---

## Onde a API está rodando

> **A API responde porque está rodando no container Docker.** Não no `pnpm dev`.

Quando você `curl http://localhost:4000/health` e recebe `200 OK`, o pacote está chegando no container **`hr-core-auth`** (porta do host `4000` mapeada via `docker-compose.yml`). O processo Node lá dentro está rodando o **JS compilado**:

```
node --import ./dist/tracing.js dist/server.js
```

Verificar a qualquer momento:

```bash
docker ps --filter "name=hr-core-auth$" --format "{{.Names}}: {{.Status}}"
# → hr-core-auth: Up X minutes (healthy)

docker exec hr-core-auth ps aux | grep node
# → 1 node ... node --import ./dist/tracing.js dist/server.js
```

### Implicações práticas

1. **`pnpm dev` em paralelo vai falhar** com `EADDRINUSE: 0.0.0.0:4000` — o container já está ocupando a porta. Veja [Execução § Desenvolvimento com hot-reload](#desenvolvimento-com-hot-reload) para os 3 caminhos de contorno.
2. **Alterar código fonte não tem efeito imediato** — você está vendo o `dist/` antigo do container. Pra refletir mudanças, ou rebuilde a imagem (`pnpm compose:up`) ou pare o container e use `pnpm dev`.
3. **O `.env` na raiz do workspace não é lido pelo container** — variáveis vêm do bloco `environment:` do `docker-compose.yml`. Editar `.env` só afeta `pnpm dev` no host.

---

## Sumário

- [Visão geral](#visão-geral)
- [Stack](#stack)
- [Requisitos](#requisitos)
- [Setup local](#setup-local)
- [Configuração (envs)](#configuração-envs)
- [Execução](#execução)
- [Seed de usuários](#seed-de-usuários)
- [Estrutura do projeto](#estrutura-do-projeto)
- [Endpoints](#endpoints)
- [Fluxos](#fluxos)
- [Modelo de dados](#modelo-de-dados)
- [Política de chaves RSA](#política-de-chaves-rsa)
- [Política de senha — scrypt](#política-de-senha--scrypt)
- [Formato de erro (RFC 7807)](#formato-de-erro-rfc-7807)
- [Observabilidade](#observabilidade)
- [Stack local com Docker Compose](#stack-local-com-docker-compose)
- [Testes](#testes)
- [Manifestos Kubernetes](#manifestos-kubernetes)
- [Roadmap](#roadmap)

---

## Visão geral

```
              ┌──────────────────┐
              │   Auth Service   │  ← @hr-core/auth (este pacote)
              │   :4000          │
              │                  │
              │  POST /register  │
              │  POST /login     │
              │  POST /refresh   │
              │  POST /logout    │
              │  GET  /jwks.json │ ← lido pelo gateway via createRemoteJWKSet
              │                  │
              │       │          │
              │       ▼          │
              │   MongoDB        │  ← hr-auth (banco próprio)
              │   - users        │
              │   - refresh_     │
              │     tokens       │
              └──────────────────┘
```

O serviço é **stateless no plano da request** (sem sessão server-side; o JWT carrega a identidade), mas mantém estado em MongoDB para:

- **`users`** — credenciais + roles + flag `active`
- **`refresh_tokens`** — cadeia de rotação com `jtiHash`, `usedAt`, `replacedBy`, `revokedAt` para auditoria e reuse-detection

---

## Stack

| Camada          | Tecnologia                                                                                                                                     |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Runtime         | Node.js ≥ 22.11                                                                                                                                |
| Framework HTTP  | [Fastify](https://fastify.dev) 5                                                                                                               |
| Validação       | [Zod](https://zod.dev) 4 + [`fastify-type-provider-zod`](https://github.com/turkerdev/fastify-type-provider-zod)                               |
| JWT (RS256)     | [`jose`](https://github.com/panva/jose)                                                                                                        |
| Hash de senha   | [`node:crypto`](https://nodejs.org/api/crypto.html) — `scrypt` nativo (sem bcrypt, conforme padrão arquitetural do projeto)                    |
| Banco           | MongoDB 7 via [`mongodb` driver nativo](https://www.mongodb.com/docs/drivers/node/current/) (sem ORM, conforme padrão arquitetural do projeto) |
| Logs            | [Pino](https://getpino.io) (built-in do Fastify)                                                                                               |
| Métricas        | [`fastify-metrics`](https://github.com/SkeLLLa/fastify-metrics) + `prom-client`                                                                |
| Tracing         | [`@opentelemetry/sdk-node`](https://opentelemetry.io/docs/languages/js/) + OTLP HTTP                                                           |
| Testes          | [Vitest](https://vitest.dev) 4                                                                                                                 |
| Containerização | Docker (multi-stage, Node 22 alpine, non-root)                                                                                                 |

---

## Requisitos

- **Node.js** ≥ 22.11
- **pnpm** ≥ 11.0
- **MongoDB** ≥ 6 (local ou via `pnpm compose:up`)
- **Docker** (opcional, para a stack local de observabilidade)
- **OpenSSL** (opcional, para gerar a chave RSA manualmente)

---

## Setup local

```bash
pnpm install                                  # na raiz do monorepo
cp services/auth/.env.example services/auth/.env
```

### Gerar a chave RSA (uma vez por ambiente)

A chave privada NÃO é versionada. Em dev, geramos localmente:

```bash
mkdir -p services/auth/keys
openssl genpkey -algorithm RSA \
  -out services/auth/keys/private.pem \
  -pkeyopt rsa_keygen_bits:2048
```

Se `AUTH_PRIVATE_KEY_PATH` não existir e `NODE_ENV=development`/`test`, o serviço gera uma chave **in-memory** automaticamente no boot (perdida a cada restart — não fazer em produção; veja [Política de chaves RSA](#política-de-chaves-rsa)).

---

## Configuração (envs)

Todas validadas em runtime via Zod no boot. Falha hard se algo obrigatório faltar.

### Runtime

| Variável    | Default       | Descrição                                                                |
| ----------- | ------------- | ------------------------------------------------------------------------ |
| `NODE_ENV`  | `development` | `development` \| `production` \| `test`                                  |
| `HOST`      | `0.0.0.0`     | Interface de bind                                                        |
| `PORT`      | `4000`        | Porta TCP                                                                |
| `LOG_LEVEL` | `info`        | `fatal` \| `error` \| `warn` \| `info` \| `debug` \| `trace` \| `silent` |

### MongoDB

| Variável        | Default   | Descrição                                            |
| --------------- | --------- | ---------------------------------------------------- |
| `MONGO_URL`     | _(req)_   | Connection string (ex.: `mongodb://localhost:27017`) |
| `MONGO_DB_NAME` | `hr-auth` | Nome do banco                                        |

### JWT

| Variável                         | Default      | Descrição                                                     |
| -------------------------------- | ------------ | ------------------------------------------------------------- |
| `AUTH_JWT_ISSUER`                | _(req)_      | Claim `iss` — deve casar com o que o gateway espera           |
| `AUTH_JWT_AUDIENCE`              | _(req)_      | Claim `aud`                                                   |
| `AUTH_JWT_KID`                   | `auth-v1`    | `kid` do header — também é o `kid` da chave publicada no JWKS |
| `AUTH_PRIVATE_KEY_PATH`          | _(opcional)_ | Caminho para a chave RSA PKCS#8 PEM (em prod é obrigatório)   |
| `AUTH_ACCESS_TOKEN_TTL_SECONDS`  | `900`        | Vida do access token (15min)                                  |
| `AUTH_REFRESH_TOKEN_TTL_SECONDS` | `604800`     | Vida do refresh token (7 dias)                                |

### scrypt (hash de senha)

| Variável            | Default | Descrição                                                  |
| ------------------- | ------- | ---------------------------------------------------------- |
| `AUTH_SCRYPT_LOG_N` | `15`    | log₂ de N — N=2¹⁵=32768 (≈64 MB/hash). Subir aumenta custo |
| `AUTH_SCRYPT_R`     | `8`     | Block size                                                 |
| `AUTH_SCRYPT_P`     | `1`     | Parallelism                                                |

### CORS

| Variável           | Default | Descrição                                                     |
| ------------------ | ------- | ------------------------------------------------------------- |
| `CORS_ORIGINS`     | `""`    | `""` = desabilitado · `*` = todos · `a.com,b.com` = allowlist |
| `CORS_CREDENTIALS` | `false` |                                                               |
| `CORS_MAX_AGE`     | `86400` |                                                               |

### OpenTelemetry

| Variável                      | Default | Descrição                                |
| ----------------------------- | ------- | ---------------------------------------- |
| `OTEL_ENABLED`                | `false` | Liga o SDK + auto-instrumentations       |
| `OTEL_SERVICE_NAME`           | `auth`  | `service.name` nos spans                 |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | —       | URL base do Collector (sem `/v1/traces`) |

---

## Execução

> Antes de tudo: **a API que está respondendo em `http://localhost:4000` é o container**, não o `pnpm dev`. Veja [Onde a API está rodando](#onde-a-api-está-rodando) para o contexto completo.

### Modo 1 — Container (default, está rodando agora)

```bash
pnpm --filter @hr-core/auth compose:up      # build + sobe a stack (auth + mongo + obs)
pnpm --filter @hr-core/auth compose:logs    # logs em follow
pnpm --filter @hr-core/auth compose:down    # derruba + apaga volumes
```

Roda `node --import ./dist/tracing.js dist/server.js` dentro de `hr-core-auth`. **Sem hot-reload** — cada mudança em `src/` exige `compose:up` novamente (rebuild ~30-60s).

### Modo 2 — `pnpm dev` (hot-reload, exige `.env` + porta livre)

`tsx watch src/server.ts` no host. Reinicia a cada alteração e formata logs com `pino-pretty`.

Antes de rodar a primeira vez:

```bash
cd services/auth

# 1. .env é OBRIGATÓRIO — sem ele, env.ts faz fail-fast no boot
cp .env.example .env

# 2. Liberar a porta 4000 (o container ainda está ocupando)
docker stop hr-core-auth
```

Depois:

```bash
pnpm --filter @hr-core/auth dev
```

### Modo 3 — Híbrido (Recomendado para dev ativo)

Mantém Mongo + Tempo + Prometheus + Grafana no compose, mas roda o auth-service localmente com hot-reload:

```bash
# 1. derruba só o container do auth (mantém o resto)
docker stop hr-core-auth

# 2. garante .env e roda dev
cd services/auth
cp .env.example .env   # se ainda não existe
pnpm dev
```

Agora você tem hot-reload + observabilidade real funcionando (logs no Tempo, métricas no Prometheus, dashboard no Grafana de `localhost:3011`).

### Modo 4 — Produção (binário compilado)

```bash
pnpm --filter @hr-core/auth build
pnpm --filter @hr-core/auth start
# node --import ./dist/tracing.js dist/server.js
```

O flag `--import` pré-carrega o SDK do OpenTelemetry **antes** dos imports da aplicação (exigência do ESM para auto-instrumentation funcionar).

### Outros scripts

```bash
pnpm --filter @hr-core/auth typecheck      # tsc --noEmit
pnpm --filter @hr-core/auth test           # vitest run
pnpm --filter @hr-core/auth test:watch
pnpm --filter @hr-core/auth test:coverage  # com thresholds 80/80/75/80
pnpm --filter @hr-core/auth seed           # popula MongoDB com admin + user
pnpm --filter @hr-core/auth compose:up     # sobe stack completa
pnpm --filter @hr-core/auth compose:down   # derruba + apaga volumes
pnpm --filter @hr-core/auth compose:logs
```

### Shutdown gracioso

`SIGTERM` e `SIGINT` disparam:

1. `app.close()` — Fastify drena conexões em curso
2. `closeMongo()` — fecha conexão com MongoDB
3. `shutdownTracing()` — flush dos spans pendentes
4. `process.exit(0)`

---

## Seed de usuários

```bash
pnpm --filter @hr-core/auth seed
```

Idempotente — roda quantas vezes quiser. Cria (se não existirem):

| Email                 | Senha        | Role            | Para que serve                            |
| --------------------- | ------------ | --------------- | ----------------------------------------- |
| `admin@hr-core.local` | `admin12345` | `ADMINISTRADOR` | CRUD de usuários e operações elevadas     |
| `coord@hr-core.local` | `coord12345` | `COORDENADOR`   | Aprovações de fluxo, relatórios da equipe |
| `user@hr-core.local`  | `user12345`  | `USUARIO`       | Operações de domínio do dia-a-dia         |

> **Atenção:** senhas fracas, propósito **exclusivamente** de teste local. Não usar em staging/prod.

---

## Estrutura do projeto

```
services/auth/
├── .env.example
├── Dockerfile
├── docker-compose.yml                  # auth + mongo + tempo + prometheus + grafana
├── docker/
│   ├── tempo.yaml
│   ├── prometheus.yml
│   └── grafana-datasources.yml
├── keys/                                # gitignored
│   └── private.pem                      # gerado localmente
├── scripts/
│   └── seed.ts                          # cria ADMINISTRADOR + USUARIO
├── test/
│   └── setup.ts
└── src/
    ├── server.ts                        # bootstrap + handlers de sinal
    ├── app.ts                           # buildApp() — fábrica do Fastify
    ├── tracing.ts                       # OpenTelemetry SDK (preloadado)
    ├── config/
    │   └── env.ts                       # Zod fail-fast
    ├── database/
    │   └── mongo.ts                     # client + ensureIndexes()
    ├── middlewares/
    │   ├── error-handler.ts             # RFC 7807 com DomainError branch
    │   ├── cors.ts
    │   └── metrics.ts                   # Prometheus em /metrics
    └── modules/
        ├── domain/
        │   ├── entities/
        │   │   ├── user.ts              # User + PublicUser + toPublicUser()
        │   │   └── refresh-token.ts     # cadeia de rotation auditável
        │   ├── errors/
        │   │   └── domain-error.ts      # EmailAlreadyTaken, InvalidCredentials,
        │   │                            # UserDisabled, InvalidRefreshToken,
        │   │                            # RefreshTokenReuseDetected
        │   └── roles.ts                 # ADMINISTRADOR | USUARIO
        ├── repositories/
        │   ├── user.repository.ts       # driver nativo MongoDB (sem ORM)
        │   └── refresh-token.repository.ts
        ├── services/
        │   ├── key.service.ts           # carrega RSA + monta JWK público
        │   ├── password.service.ts      # scrypt encode/verify com timing-safe
        │   ├── token.service.ts         # emite par access+refresh
        │   └── auth.service.ts          # register/login/refresh/logout
        ├── schemas/
        │   └── auth.schema.ts           # Zod schemas das rotas
        └── controllers/
            ├── auth.controller.ts       # /auth/{register,login,refresh,logout}
            ├── jwks.controller.ts       # /.well-known/jwks.json
            └── health.controller.ts     # /health, /ready
```

---

## Endpoints

### Públicos (sem auth)

| Método | Path                     | Descrição                                  |
| ------ | ------------------------ | ------------------------------------------ |
| `GET`  | `/health`                | Liveness probe                             |
| `GET`  | `/ready`                 | Readiness probe                            |
| `GET`  | `/metrics`               | Prometheus                                 |
| `GET`  | `/.well-known/jwks.json` | Chave pública RSA (consumida pelo gateway) |
| `POST` | `/auth/register`         | Cria usuário + retorna par de tokens       |
| `POST` | `/auth/login`            | Autentica + retorna par de tokens          |
| `POST` | `/auth/refresh`          | Rotaciona refresh token                    |
| `POST` | `/auth/logout`           | Revoga refresh token (idempotente)         |

### Response — par de tokens

```json
{
  "user": {
    "id": "6a0623ed5396dcdcccec5244",
    "email": "admin@hr-core.local",
    "roles": ["ADMINISTRADOR"],
    "active": true,
    "createdAt": "2026-05-14T19:35:09.839Z"
  },
  "accessToken": "eyJhbGciOi...",
  "refreshToken": "eyJhbGciOi...",
  "accessTokenExpiresAt": "2026-05-14T19:50:09.839Z",
  "refreshTokenExpiresAt": "2026-05-21T19:35:09.839Z"
}
```

---

## Fluxos

### Login

```
Cliente                        Auth Service                   MongoDB
   │                                │                            │
   │  POST /auth/login              │                            │
   │  {email,password}              │                            │
   ├───────────────────────────────►│                            │
   │                                │  findByEmail(email)        │
   │                                ├───────────────────────────►│
   │                                │◄───────────────────────────┤
   │                                │  user                      │
   │                                │                            │
   │                                │  verifyPassword(           │
   │                                │    password,               │
   │                                │    user.passwordHash       │
   │                                │  )  ← scrypt timing-safe   │
   │                                │                            │
   │                                │  issueTokenPair() ← JWT RS256
   │                                │  cria refresh_token        │
   │                                │  (jtiHash, expiresAt)      │
   │                                ├───────────────────────────►│
   │                                │                            │
   │  200 { access, refresh, user } │                            │
   │◄───────────────────────────────┤                            │
```

### Refresh com rotation (e reuse detection)

```
                            ┌────────────────────┐
   POST /auth/refresh       │ refresh_token doc: │
   { refreshToken }         │  jtiHash=H1        │
        │                   │  usedAt=null       │
        ▼                   │  revokedAt=null    │
   jwtVerify (RS256)        │  expiresAt=...     │
   payload.jti=J1           └─────────┬──────────┘
   hashJti(J1) === H1                 │
        │                              │
        ├── usedAt != null? ───── SIM ─► revoga TODOS os tokens deste user
        │                                  → 401 refresh-token-reuse-detected
        │
        └── não usado ainda
            │
            ├── issueTokenPair() → novo par, jti=J2
            ├── refresh_repo.create(H2, expiresAt)
            ├── refresh_repo.markUsed(H1, replacedBy=H2)  ← atômico
            │     condition: { jtiHash:H1, usedAt:null, revokedAt:null }
            │     se falhou (concorrência) → revoga TODOS + 401
            │
            └── 200 { access, refresh (novo), user }
```

**Cadeia auditável** — cada documento `refresh_token` referencia o sucessor em `replacedBy`. Permite reconstruir sessões inteiras para forense.

### Logout

Idempotente — `revokeByJtiHash`. Token inválido/inexistente retorna 204 igual (não vaza informação sobre existência da sessão).

### Reuse detection — defesa em profundidade

Quando alguém apresenta um refresh token **já consumido** (sinal de exfiltração — o atacante copiou o token antes da rotation original):

1. Resposta 401 com `refresh-token-reuse-detected`
2. **TODOS** os tokens daquele `userId` são marcados como `revokedAt`
3. Próximo refresh — inclusive o "legítimo" — falha com `invalid-refresh-token`
4. Usuário precisa fazer login novamente

A justificativa: como Auth Service não sabe quem é o real dono do par, é mais seguro forçar re-autenticação do que arriscar continuar servindo um atacante.

---

## Modelo de dados

### `users`

```ts
{
  _id: ObjectId,
  email: string,                  // único, lowercase
  passwordHash: string,           // "scrypt$logN$r$p$salt$hash"
  roles: string[],                // ['ADMINISTRADOR'] | ['USUARIO'] | ...
  active: boolean,                // false = bloqueia login (UserDisabledError)
  createdAt: Date,
  updatedAt: Date,
}
```

Índices:

- `email` único
- `createdAt` descendente (paginação)

### `refresh_tokens`

```ts
{
  _id: ObjectId,
  jtiHash: string,                // SHA-256 hex do jti (jti em claro nunca persiste)
  userId: ObjectId,               // FK para users
  issuedAt: Date,
  expiresAt: Date,                // TTL — MongoDB remove docs após expirar
  usedAt: Date | null,            // marcado em rotation
  replacedBy: string | null,      // jtiHash do par sucessor (cadeia)
  revokedAt: Date | null,         // logout ou reuse-detection
  userAgent: string | null,       // auditoria
  ip: string | null,
}
```

Índices:

- `jtiHash` único — lookup constante em refresh
- `userId` — revogação em cascata
- `expiresAt` TTL `expireAfterSeconds: 0` — MongoDB **remove** docs automaticamente após `expiresAt`

---

## Política de chaves RSA

### Geração

```bash
openssl genpkey -algorithm RSA \
  -out services/auth/keys/private.pem \
  -pkeyopt rsa_keygen_bits:2048
```

2048 bits é o mínimo NIST recomendado (até 2030). Para horizonte mais longo, usar 3072 ou 4096.

### Armazenamento

| Ambiente      | Como                                                                                             |
| ------------- | ------------------------------------------------------------------------------------------------ |
| `development` | arquivo local `services/auth/keys/private.pem` (gitignored). Sem arquivo, gera in-memory no boot |
| `test`        | in-memory automaticamente                                                                        |
| `production`  | **Sealed Secret** / **External Secret** montado como volume no pod                               |

Em prod, `AUTH_PRIVATE_KEY_PATH` é **obrigatório** — boot falha hard se o arquivo não existir.

### Rotação

A V1 suporta **uma chave ativa** (`AUTH_JWT_KID`). Rotação manual:

1. Gerar nova chave em outro path (ex.: `keys/private-v2.pem`)
2. Atualizar `AUTH_JWT_KID=auth-v2` e `AUTH_PRIVATE_KEY_PATH=.../private-v2.pem`
3. Deploy do auth → JWKS começa a servir a nova `kid`
4. Aguardar TTL do cache JWKS do gateway (10min) — depois disso só tokens novos
5. Aguardar TTL do access token antigo (15min) — todos os tokens emitidos com a chave antiga expiram
6. Apagar a chave antiga

Roadmap: suportar **2 chaves no JWKS simultaneamente** (current + previous) para zero-downtime sem espera.

---

## Política de senha — scrypt

### Por que scrypt e não bcrypt

O padrão arquitetural do projeto exige uso de `crypto` nativo do Node.js, sem bcrypt. Razões:

- `node:crypto.scrypt` é nativo, sem dependência externa
- Memory-hard (resistente a GPU/ASIC) — bcrypt é apenas CPU-hard
- Padronizado em RFC 7914

### Parâmetros default

- **N=2¹⁵ (32768)**, r=8, p=1 → ~64 MB de memória por hash, ~150ms em CPU moderna
- Cobre 99% dos cenários. Para servidores com mais RAM, subir para `LOG_N=16` dobra o custo.

### Formato encoded

```
scrypt$<logN>$<r>$<p>$<saltBase64>$<hashBase64>
```

Os parâmetros são **inline no hash** — permite rotacionar `AUTH_SCRYPT_LOG_N` sem invalidar hashes antigos (cada hash é verificado com seus parâmetros originais).

### Comparação timing-safe

`crypto.timingSafeEqual` — protege contra timing attacks no compare.

---

## Formato de erro (RFC 7807)

Todas as respostas de erro têm `Content-Type: application/problem+json`:

```json
{
  "type": "https://hr-core/errors/invalid-credentials",
  "title": "Invalid credentials",
  "status": 401,
  "detail": "Invalid email or password",
  "instance": "/auth/login",
  "traceId": "8a1c4f63-9c2e-4f3b-9a2e-3f8c1d2b7a6e"
}
```

| Status | `type`                         | Quando                                                               |
| ------ | ------------------------------ | -------------------------------------------------------------------- |
| 400    | `validation`                   | Falha de schema Zod (com campo `errors`)                             |
| 400    | `bad-request`                  | Erro genérico de cliente                                             |
| 401    | `invalid-credentials`          | Email/senha errados (mensagem genérica — anti-enumeração)            |
| 401    | `invalid-refresh-token`        | Refresh inválido, expirado ou inexistente                            |
| 401    | `refresh-token-reuse-detected` | Token já consumido reapresentado — todos os tokens do user revogados |
| 403    | `user-disabled`                | Conta desativada                                                     |
| 404    | `not-found`                    | Rota inexistente                                                     |
| 409    | `email-already-taken`          | Register com email duplicado                                         |
| ≥ 500  | `internal`                     | Erro de servidor — `detail` genérico, não vaza internals             |

---

## Observabilidade

### Logs (Pino)

Estruturado em JSON. Em `development`, formatado por `pino-pretty`. Campos garantidos:

- `service: "auth"`
- `reqId` / `traceId` — UUID v4 ou propagado via header `X-Trace-Id`
- `level`, `time`, `msg`
- Em erros de domínio: `code` (`invalid-credentials`, `email-already-taken`, etc.)

### Métricas (Prometheus)

`GET /metrics` expõe:

- **Default** (`prom-client`): CPU, memória, GC, eventloop lag, FDs
- **Por rota**: `http_request_duration_seconds`, `http_request_summary_seconds` com labels `method`, `route`, `status_code`

### Tracing (OpenTelemetry → Tempo)

Quando `OTEL_ENABLED=true`:

- Auto-instrumenta `http`, `pino`, `mongodb`, `undici`
- Spans HTTP inbound + spans de query Mongo automaticamente
- `trace_id` injetado nos logs (via `instrumentation-pino`) para correlação log <-> trace no Grafana

---

## Stack local com Docker Compose

```bash
pnpm --filter @hr-core/auth compose:up
```

Sobe 5 containers:

| Container                 | Porta host     | Função                                                      |
| ------------------------- | -------------- | ----------------------------------------------------------- |
| `hr-core-auth`            | `4000`         | O próprio auth-service (build local, `OTEL_ENABLED=true`)   |
| `hr-core-auth-mongo`      | `27017`        | MongoDB 7 (volume persistente `mongo-data`)                 |
| `hr-core-auth-tempo`      | `3210`, `4328` | Grafana Tempo (HTTP API + OTLP HTTP)                        |
| `hr-core-auth-prometheus` | `9091`         | Raspa `/metrics` a cada 15s                                 |
| `hr-core-auth-grafana`    | `3011`         | UI métricas + traces — login `administrador` / `1qaz2wsx12` |

Portas escolhidas para **não colidir** com o compose do api-gateway (que usa 3000, 3001, 3200, 4318, 9090).

### Validação rápida

```bash
# Health
curl http://localhost:4000/health
# → {"status":"ok","service":"auth","timestamp":"..."}

# JWKS
curl http://localhost:4000/.well-known/jwks.json | jq '.keys[0].kid'
# → "auth-v1"

# Login admin (do seed)
curl -X POST http://localhost:4000/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@hr-core.local","password":"admin12345"}' | jq '.user.roles'
# → ["ADMINISTRADOR"]
```

### Importar collection Postman

`hr-core.postman_collection.json` na raiz já tem o folder **Auth Service (direto :4000)** com todos os endpoints + test scripts que salvam `access_token` e `refresh_token` em variáveis da collection.

---

## Testes

```bash
pnpm --filter @hr-core/auth test
```

Suite Vitest 4. Thresholds de cobertura: lines/functions/statements **80%**, branches **75%**.

> **Estado atual:** apenas o smoke test E2E manual (curl) está em pé. A suite unitária dos services (`password`, `token`, `auth`) e dos repositories vai no próximo ciclo. O scaffold do Vitest está pronto e funcional — adicionar testes em `src/**/*.test.ts`.

Padrão para um teste de service:

```ts
import { describe, expect, it } from 'vitest'

import { hashPassword, verifyPassword } from './password.service.js'

describe('password.service', () => {
  it('verifies the original password and rejects others', async () => {
    const encoded = await hashPassword('s3nha-forte')
    expect(await verifyPassword('s3nha-forte', encoded)).toBe(true)
    expect(await verifyPassword('outra-senha', encoded)).toBe(false)
  })
})
```

---

## Manifestos Kubernetes

Disponíveis em [`manifests/auth/`](../../manifests/auth/) (Kustomize com `base` + `overlays/dev`). Detalhes em [`manifests/README.md`](../../manifests/README.md).

Application Argo CD: [`argocd/applications/auth-dev.yaml`](../../argocd/applications/auth-dev.yaml) — sincroniza `manifests/auth/overlays/dev` → namespace `hr-core-dev`.

---

## Roadmap

V1 (este pacote) cobre o MVP funcional. Itens conhecidos e ainda não implementados:

- [ ] **CRUD de usuários para ADMINISTRADOR** — listar, ativar/desativar, deletar, mudar role
- [ ] **Middleware RBAC** — decorator `fastify.requireRole(role)` para proteger endpoints administrativos
- [ ] **Evento Kafka `usuario.disabled`** — para invalidar sessões em todos os serviços
- [ ] **Evento Kafka `token.revoked`** — gateway consome e mantém set de tokens revogados em memória
- [ ] **Password change** — `POST /auth/password/change` (requer autenticação)
- [ ] **`/me`** — perfil do usuário autenticado
- [ ] **Key rotation com 2 chaves simultâneas no JWKS** — zero-downtime
- [ ] **Suite Vitest cobrindo services + repositories** (com MongoDB test container)
- [ ] **Suite E2E** (vitest contra compose)
- [ ] **Rate limit em `/auth/login`** — proteção contra brute force (in-memory ou Redis)
- [ ] **MFA** (TOTP) — opcional por usuário
- [ ] **Audit log** — todo login/logout/refresh com IP + user-agent em uma coleção dedicada
- [ ] **OAuth/OIDC providers** (Google, Microsoft, GitHub) — opcional
