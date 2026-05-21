# @hr-core/funcionario

> Funcionario Service do HR Core — gestão do ciclo de vida do colaborador: cadastro, workflow de admissão eSocial, documentos digitalizados, aprovações cadastrais e códigos legíveis (FUN/HR).

Responsável **exclusivamente** por:

- Cadastro de funcionários (`POST /funcionarios`)
- **Workflow de admissão** (PENDENTE → EM_VALIDACAO → APROVADO → ATIVO + REPROVADO terminal)
- **Documentos digitalizados** (upload em MinIO/S3 + análise/aprovação pelo COORDENADOR)
- **Score eSocial automático** (recalcula a cada aprovação; ativa funcionário quando atinge 100)
- **Aprovações cadastrais** (`PATCH` cria pendência, COORDENADOR aprova/rejeita)
- Consulta paginada (`GET /funcionarios`) e por id (`GET /funcionarios/:id`)
- Desligamento via soft delete (`DELETE /funcionarios/:id`)
- Emissão de **dois códigos legíveis** por funcionário:
  - **codigoFun** — derivado do CPF, determinístico (`FUN` + 11 dígitos)
  - **codigoHR** — sequencial atômico via contador (`HR` + ≥7 dígitos)

**Não** valida credenciais nem emite JWT — isso é responsabilidade do Auth Service. Este serviço apenas **valida** o JWT remoto via JWKS (Zero Trust). Eventos Kafka (`funcionario.created`, etc.) ainda **não estão implementados** — entram em fase futura.

---

## Onde a API está rodando

> **A API responde porque está rodando no container Docker.** Não no `pnpm dev`.

Quando você `curl http://localhost:3002/health` e recebe `200 OK`, o pacote está chegando no container **`hr-core-funcionario`** (porta do host `3002` mapeada via `docker-compose.yml`). O processo Node lá dentro está rodando o **JS compilado**:

```
node --import ./dist/tracing.js dist/server.js
```

Verificar a qualquer momento:

```bash
docker ps --filter "name=hr-core-funcionario$" --format "{{.Names}}: {{.Status}}"
# → hr-core-funcionario: Up X minutes (healthy)

docker exec hr-core-funcionario ps aux | grep node
# → 1 node ... node --import ./dist/tracing.js dist/server.js
```

### Implicações práticas

1. **`pnpm dev` em paralelo vai falhar** com `EADDRINUSE: 0.0.0.0:3002` — o container já está ocupando a porta. Pare o container (`pnpm compose:down`) antes de rodar `pnpm dev`.
2. **Alterar código fonte não tem efeito imediato** — você está vendo o `dist/` antigo do container. Pra refletir mudanças, ou rebuilde a imagem (`pnpm compose:up`) ou pare o container e use `pnpm dev`.
3. **O `.env` do serviço não é lido pelo container** — variáveis vêm do bloco `environment:` do `docker-compose.yml`. Editar `.env` só afeta `pnpm dev` no host.

---

## Sumário

- [Visão geral](#visão-geral)
- [Stack](#stack)
- [Requisitos](#requisitos)
- [Setup local](#setup-local)
- [Configuração (envs)](#configuração-envs)
- [Execução](#execução)
- [Seed de funcionários](#seed-de-funcionários)
- [Estrutura do projeto](#estrutura-do-projeto)
- [Endpoints](#endpoints)
- [Códigos FUN e HR](#códigos-fun-e-hr)
- [Autorização (RBAC)](#autorização-rbac)
- [Modelo de dados](#modelo-de-dados)
- [Workflow de admissão (rules 1-8)](#workflow-de-admissão-rules-1-8)
- [Formato de erro (RFC 7807)](#formato-de-erro-rfc-7807)
- [Observabilidade](#observabilidade)
- [Stack local com Docker Compose](#stack-local-com-docker-compose)
- [Testes](#testes)
- [Roadmap](#roadmap)

---

## Visão geral

```
              ┌────────────────────────┐
              │  Funcionario Service   │  ← @hr-core/funcionario (este pacote)
              │  :3002                 │
              │                        │
              │  POST   /funcionarios  │  (USUARIO)
              │  GET    /funcionarios  │  (USUARIO ou COORDENADOR)
              │  GET    /funcionarios/ │  (USUARIO ou COORDENADOR)
              │           :id          │
              │  DELETE /funcionarios/ │  (USUARIO — soft delete)
              │           :id          │
              │                        │
              │       │                │
              │       ▼                │
              │   MongoDB              │  ← hr-funcionarios (banco próprio)
              │   - funcionarios       │
              │   - contadores         │  ← sequência atômica do codigoHR
              └────────────────────────┘
                        │
                        │   valida JWT via JWKS remoto
                        ▼
              ┌────────────────────────┐
              │   Auth Service         │
              │   /.well-known/        │
              │      jwks.json         │
              └────────────────────────┘
```

V1 mínima: CRUD básico + emissão dos códigos. Documentos (RG, CTPS, etc.), workflow de admissão, integração via Kafka e dependências hierárquicas (gestor → equipe) são roadmap.

---

## Stack

| Camada          | Tecnologia                                                                                                                                     |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Runtime         | Node.js ≥ 22.11                                                                                                                                |
| Framework HTTP  | [Fastify](https://fastify.dev) 5                                                                                                               |
| Validação       | [Zod](https://zod.dev) 4 + [`fastify-type-provider-zod`](https://github.com/turkerdev/fastify-type-provider-zod)                               |
| Auth (JWT)      | [`jose`](https://github.com/panva/jose) — `createRemoteJWKSet` consumindo o JWKS do Auth Service                                               |
| Banco           | MongoDB 7 via [`mongodb` driver nativo](https://www.mongodb.com/docs/drivers/node/current/) (sem ORM, conforme padrão arquitetural do projeto) |
| Docs            | [`@fastify/swagger`](https://github.com/fastify/fastify-swagger) + [`@fastify/swagger-ui`](https://github.com/fastify/fastify-swagger-ui)      |
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
- **Auth Service rodando** (para o JWKS estar acessível em runtime — em dev: `pnpm --filter @hr-core/auth compose:up`)
- **Docker** (opcional, para a stack local de observabilidade)

---

## Setup local

```bash
pnpm install                                              # na raiz do monorepo
cp services/funcionario/.env.example services/funcionario/.env
```

Garanta que o Auth Service esteja em pé antes de subir o funcionario (o JWKS precisa estar acessível em `AUTH_JWKS_URL`):

```bash
pnpm --filter @hr-core/auth compose:up
```

---

## Configuração (envs)

Todas validadas em runtime via Zod no boot. Falha hard se algo obrigatório faltar.

### Runtime

| Variável    | Default       | Descrição                                                                |
| ----------- | ------------- | ------------------------------------------------------------------------ |
| `NODE_ENV`  | `development` | `development` \| `production` \| `test`                                  |
| `HOST`      | `0.0.0.0`     | Interface de bind                                                        |
| `PORT`      | `3002`        | Porta TCP                                                                |
| `LOG_LEVEL` | `info`        | `fatal` \| `error` \| `warn` \| `info` \| `debug` \| `trace` \| `silent` |

### MongoDB

| Variável        | Default           | Descrição                                             |
| --------------- | ----------------- | ----------------------------------------------------- |
| `MONGO_URL`     | _(req)_           | Connection string (ex.: `mongodb://localhost:27018`)  |
| `MONGO_DB_NAME` | `hr-funcionarios` | Nome do banco — separado do banco do Auth (`hr-auth`) |

### JWT (consumido do Auth)

| Variável            | Default | Descrição                                                                        |
| ------------------- | ------- | -------------------------------------------------------------------------------- |
| `AUTH_JWKS_URL`     | _(req)_ | URL do JWKS do Auth Service (ex.: `http://localhost:4000/.well-known/jwks.json`) |
| `AUTH_JWT_ISSUER`   | _(req)_ | Claim `iss` esperado — precisa casar com o `iss` emitido pelo Auth               |
| `AUTH_JWT_AUDIENCE` | _(req)_ | Claim `aud` esperado                                                             |

O JWKS é cacheado pela `jose` (`createRemoteJWKSet`) — TTL 10min e cooldown 30s entre re-fetches em caso de `kid` desconhecido. Não bloqueia o boot do serviço; o primeiro request autenticado dispara o fetch.

### Swagger / OpenAPI

| Variável               | Default | Descrição                                                     |
| ---------------------- | ------- | ------------------------------------------------------------- |
| `SWAGGER_ENABLED`      | `true`  | Habilita `/docs` (UI) e `/docs/json` (spec). Desative em prod |
| `SWAGGER_ROUTE_PREFIX` | `/docs` | Prefixo das rotas de documentação                             |

### CORS

| Variável           | Default | Descrição                                                     |
| ------------------ | ------- | ------------------------------------------------------------- |
| `CORS_ORIGINS`     | `""`    | `""` = desabilitado · `*` = todos · `a.com,b.com` = allowlist |
| `CORS_CREDENTIALS` | `false` |                                                               |
| `CORS_MAX_AGE`     | `86400` |                                                               |

### OpenTelemetry

| Variável                      | Default       | Descrição                                |
| ----------------------------- | ------------- | ---------------------------------------- |
| `OTEL_ENABLED`                | `false`       | Liga o SDK + auto-instrumentations       |
| `OTEL_SERVICE_NAME`           | `funcionario` | `service.name` nos spans                 |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | —             | URL base do Collector (sem `/v1/traces`) |

### Object storage (MinIO em dev, S3 em prod)

| Variável                     | Default                     | Descrição                                                                 |
| ---------------------------- | --------------------------- | ------------------------------------------------------------------------- |
| `S3_ENDPOINT`                | _(req)_                     | Endpoint **interno** (rede do compose). Ex.: `http://minio:9000`          |
| `S3_PUBLIC_ENDPOINT`         | mesmo de `S3_ENDPOINT`      | Endpoint **público** — usado nas presigned URLs (alcançável pelo browser) |
| `S3_REGION`                  | `us-east-1`                 | Região AWS (MinIO ignora, mas o SDK exige)                                |
| `S3_ACCESS_KEY`              | _(req)_                     | Em dev: `minioadmin`                                                      |
| `S3_SECRET_KEY`              | _(req)_                     | Em dev: `minioadmin`                                                      |
| `S3_BUCKET`                  | `hr-funcionario-documentos` | Bucket onde os documentos são armazenados                                 |
| `S3_FORCE_PATH_STYLE`        | `true`                      | MinIO exige path-style (`/bucket/key`). Em AWS real, deixe `false`        |
| `S3_PRESIGN_EXPIRES_SECONDS` | `900`                       | TTL das presigned URLs de download (máx 3600)                             |

O bucket é criado **automaticamente** no boot do serviço (`ensureBucket()` no `server.ts`). Em compose, o container `minio-init` também tenta criar via `mc mb --ignore-existing` — defesa em profundidade.

---

## Execução

### Containerizado (recomendado para validar o serviço completo)

```bash
pnpm --filter @hr-core/funcionario compose:up
# → http://localhost:3002
```

### Desenvolvimento com hot-reload

> Pare o container antes (`pnpm compose:down`) — `pnpm dev` não convive com o container ocupando a porta 3002.

```bash
pnpm --filter @hr-core/funcionario dev
```

### Build + start (modo prod-like, sem container)

```bash
pnpm --filter @hr-core/funcionario build
pnpm --filter @hr-core/funcionario start
```

---

## Seed de funcionários

Popula o banco com 3 colaboradores de teste — o suficiente para validar o fluxo completo (lista paginada + busca por id + soft delete) sem polir o banco com fixtures.

```bash
pnpm --filter @hr-core/funcionario seed
```

| Nome        | Email                       | CPF              | Departamento     | Cargo          |
| ----------- | --------------------------- | ---------------- | ---------------- | -------------- |
| Ana Lima    | `ana.lima@hr-core.local`    | `111.444.777-35` | Tecnologia       | Desenvolvedora |
| Bruno Costa | `bruno.costa@hr-core.local` | `529.982.247-25` | Recursos Humanos | Coordenador    |
| Carla Dias  | `carla.dias@hr-core.local`  | `123.456.789-09` | Financeiro       | Analista       |

Os mesmos 3 emails aparecem no seed do **Auth Service** — o JWT de cada usuário corresponde a um registro real de funcionario. O `cargo` é mantido genérico (sem repetir o departamento) para não criar redundância com o campo `departamento`.

O seed é **idempotente** — usa o CPF (canônico, sem máscara) como chave de existência. Roda quantas vezes quiser sem duplicar.

> O seed escreve direto no Mongo via repositórios, sem passar pela API HTTP — portanto não precisa de JWT. Os códigos `FUN` (determinístico) e `HR` (sequencial atômico via `contadores`) são gerados pelo service.

### Fluxo completo via HTTP (reusando o seed do Auth)

O Auth Service tem seu próprio seed que cria `ana.lima@hr-core.local` (ADMINISTRADOR), `bruno.costa@hr-core.local` (COORDENADOR) e `carla.dias@hr-core.local` (USUARIO). Para autenticar e exercitar o CRUD:

```bash
# 1. Suba os 2 stacks
pnpm --filter @hr-core/auth compose:up
pnpm --filter @hr-core/funcionario compose:up

# 2. Rode os 2 seeds (idempotentes)
pnpm --filter @hr-core/auth seed
pnpm --filter @hr-core/funcionario seed

# 3. Login no Auth como USUARIO (Carla Dias) — perfil operacional, captura accessToken
ACCESS_TOKEN=$(curl -s -X POST http://localhost:4000/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"carla.dias@hr-core.local","password":"carla12345"}' \
  | jq -r .accessToken)

# 4. Lista os funcionários seedados (3 registros)
curl -s http://localhost:3002/funcionarios \
  -H "Authorization: Bearer $ACCESS_TOKEN" | jq

# 5. Busca por id (USUARIO ou COORDENADOR — bruno.costa@hr-core.local também serve)
curl -s http://localhost:3002/funcionarios/<id> \
  -H "Authorization: Bearer $ACCESS_TOKEN" | jq
```

| Usuário Auth (login)                       | Role          | O que consegue fazer no funcionario                      |
| ------------------------------------------ | ------------- | -------------------------------------------------------- |
| `carla.dias@hr-core.local` / `carla12345`  | USUARIO       | tudo — cadastra, lista, consulta, desliga (soft delete)  |
| `bruno.costa@hr-core.local` / `bruno12345` | COORDENADOR   | lista e consulta — **não** cadastra nem desliga          |
| `ana.lima@hr-core.local` / `ana12345`      | ADMINISTRADOR | nada — sem acesso (cuida só de usuários no Auth Service) |

---

## Estrutura do projeto

```
services/funcionario/
├── src/
│   ├── config/                # Validação Zod das envs (env.ts)
│   ├── database/              # connectMongo + ensureIndexes
│   ├── middlewares/           # auth, cors, error-handler, metrics, swagger
│   ├── modules/
│   │   ├── domain/
│   │   │   ├── entities/          # Funcionario, FUNCIONARIO_STATUS
│   │   │   ├── errors/            # DomainError + subclasses (CpfInvalido, etc.)
│   │   │   ├── roles.ts           # ROLES + isValidRole
│   │   │   └── value-objects/     # Cpf, codigoFuncionario, codigoHR
│   │   ├── repositories/      # funcionario.repository, contador.repository
│   │   ├── schemas/           # Schemas Zod das rotas
│   │   ├── services/          # funcionario.service (lógica de negócio)
│   │   └── controllers/       # buildFuncionarioRoutes (Fastify routes)
│   ├── app.ts                 # buildApp (plugins + rotas)
│   ├── server.ts              # bootstrap + graceful shutdown
│   └── tracing.ts             # OpenTelemetry SDK
├── test/                      # helpers: db (clean), jwks (signer local)
├── e2e/                       # suite E2E HTTP contra o compose
├── docker/                    # tempo.yaml, prometheus.yml, dashboards/
├── scripts/                   # e2e.sh (orquestra compose + vitest)
├── docker-compose.yml         # stack local (5 containers)
├── Dockerfile                 # multi-stage (build → runtime alpine non-root)
├── package.json
├── tsconfig.json / tsconfig.build.json
└── vitest.config.ts / vitest.e2e.config.ts
```

---

## Endpoints

| Método | Rota                                             | Role mínima                      | Resposta esperada                                                                                    |
| ------ | ------------------------------------------------ | -------------------------------- | ---------------------------------------------------------------------------------------------------- |
| GET    | `/health`                                        | _público_                        | `{ status, service, timestamp }`                                                                     |
| GET    | `/metrics`                                       | _público_                        | Prometheus text                                                                                      |
| GET    | `/docs` / `/docs/json`                           | _público_ (se `SWAGGER_ENABLED`) | UI Swagger + spec OpenAPI 3.x                                                                        |
| POST   | `/funcionarios`                                  | `USUARIO`                        | `201 { data: PublicFunc }` (PENDENTE)                                                                |
| GET    | `/funcionarios`                                  | `USUARIO` ou `COORDENADOR`       | `200 { data: [], meta }`                                                                             |
| GET    | `/funcionarios/:id`                              | `USUARIO` ou `COORDENADOR`       | `200 { data: PublicFunc }`                                                                           |
| PATCH  | `/funcionarios/:id`                              | `USUARIO`                        | `202 { data: PublicAprovacao }` (cria pendência, não aplica)                                         |
| DELETE | `/funcionarios/:id`                              | `USUARIO`                        | `204` (soft delete)                                                                                  |
| POST   | `/funcionarios/:id/documentos`                   | `USUARIO`                        | `201 { data: PublicDocumento }` (multipart)                                                          |
| GET    | `/funcionarios/:id/documentos`                   | `USUARIO` ou `COORDENADOR`       | `200 { data: PublicDocumento[] }`                                                                    |
| POST   | `/documentos/:id/aprovar`                        | `COORDENADOR`                    | `200` — recalcula score + eventualmente ATIVA o funcionário                                          |
| POST   | `/documentos/:id/rejeitar`                       | `COORDENADOR`                    | `200` — body `{ motivo }`                                                                            |
| POST   | `/funcionarios/:id/documentos/aprovar-pendentes` | `COORDENADOR`                    | `200` — aprova em batch todos os PENDENTES do funcionário; recalcula score 1× e tenta promover ATIVO |
| GET    | `/aprovacoes`                                    | `COORDENADOR`                    | `200 { data: PublicAprovacao[] }` (filtros: `status`, `funcionarioId`)                               |
| GET    | `/aprovacoes/:id`                                | `COORDENADOR`                    | `200 { data: PublicAprovacao }`                                                                      |
| POST   | `/aprovacoes/:id/aprovar`                        | `COORDENADOR`                    | `200` — aplica `camposAlterados` no funcionário                                                      |
| POST   | `/aprovacoes/:id/rejeitar`                       | `COORDENADOR`                    | `200` — body `{ motivo }`                                                                            |

### Envelopes de resposta

Listagem (envelope `{ data, meta }`):

```json
{
  "data": [ { "id": "…", "codigoFun": "FUN11144477735", "codigoHR": "HR0000001", … } ],
  "meta": { "total": 42, "page": 1, "limit": 20, "pages": 3 }
}
```

Item único (envelope `{ data }`):

```json
{ "data": { "id": "…", "codigoFun": "…", "codigoHR": "…", … } }
```

### Filtros de listagem

`GET /funcionarios?page=1&limit=20&status=ATIVO&departamento=Tecnologia`

| Query          | Tipo                                     | Default    | Notas       |
| -------------- | ---------------------------------------- | ---------- | ----------- |
| `page`         | int ≥ 1                                  | `1`        |             |
| `limit`        | int 1–100                                | `20`       |             |
| `status`       | `ATIVO`/`INATIVO`/`AFASTADO`/`DESLIGADO` | _opcional_ |             |
| `departamento` | string                                   | _opcional_ | match exato |

---

## Códigos FUN e HR

Dois identificadores legíveis são gerados no momento da criação, **além** do `_id` ObjectId. Servem para usuários humanos referenciarem o funcionário sem precisar manipular ObjectIds.

### codigoFun — determinístico do CPF

Formato: `FUN` + 11 dígitos do CPF (sem máscara).

```ts
gerarCodigoFuncionario(new Cpf('111.444.777-35')) // → "FUN11144477735"
```

**Propriedade:** mesmo CPF → mesmo `codigoFun`. Útil para deduplicação e migração de dados.

### codigoHR — sequencial atômico

Formato: `HR` + ≥7 dígitos (zero-padded até 7, depois cresce naturalmente).

```ts
gerarCodigoHR(1) // → "HR0000001"
gerarCodigoHR(42) // → "HR0000042"
gerarCodigoHR(9999999) // → "HR9999999"
gerarCodigoHR(10000000) // → "HR10000000"  (cresce além de 7 dígitos)
```

**Garantia de unicidade:** a próxima sequência vem de `ContadorRepository.proximoValor('funcionario:hr')`, que usa um `findOneAndUpdate` com `$inc` e `upsert: true` na coleção `contadores`. O Mongo garante atomicidade por documento — duas escritas concorrentes recebem valores distintos sem race condition.

### Por que dois códigos?

| Código      | Caso de uso                                           |
| ----------- | ----------------------------------------------------- |
| `codigoFun` | Deduplicação por CPF, integrações fiscais             |
| `codigoHR`  | Crachá, identificação interna, ordem de admissão      |
| `_id`       | Joins internos no Mongo (não exposto via API pública) |

Ambos são índices `unique` na coleção — colisão acidental é rejeitada no `insertOne`.

---

## Autorização (RBAC)

O JWT carrega o claim `roles: string[]` (emitido pelo Auth Service). O middleware `fastify.requireRole(role)` valida na entrada da rota:

```ts
// src/middlewares/auth.ts
fastify.decorate('requireRole', (role: Role | Role[]) => async (request) => {
  const allowed = Array.isArray(role) ? role : [role]
  if (!request.user?.roles.some((r) => allowed.includes(r))) {
    throw fastify.httpErrors.forbidden('insufficient-role')
  }
})
```

Responsabilidades por role neste serviço (sem herança automática — cada role é um escopo distinto):

| Role            | Acesso típico                                                                            |
| --------------- | ---------------------------------------------------------------------------------------- |
| `USUARIO`       | CRUD operacional — cadastra, lista, consulta, desliga (soft delete)                      |
| `COORDENADOR`   | Lista e consulta — **não** cadastra nem desliga (aprovações vivem em endpoints próprios) |
| `ADMINISTRADOR` | **Sem acesso** — esse perfil só faz CRUD de usuários no Auth Service                     |

Token sem `roles` ou com role desconhecida → `403 insufficient-role`. ADMINISTRADOR autenticado também recebe `403` em qualquer endpoint deste serviço.

---

## Modelo de dados

### `funcionarios`

```ts
{
  _id: ObjectId,
  codigoFun: string,            // único — "FUN" + 11 dígitos CPF
  codigoHR: string,             // único — "HR" + ≥7 dígitos
  nome: string,
  cpf: string,                  // único, canônico (sem máscara)
  email: string,                // único, lowercase
  telefone: string,
  cargo: string,
  departamento: string,
  gestorId: string | null,
  status:
    | 'PENDENTE' | 'EM_VALIDACAO' | 'APROVADO' | 'ATIVO'  // workflow de admissão
    | 'REPROVADO'                                          // terminal
    | 'AFASTADO' | 'INATIVO' | 'DESLIGADO',               // pós-admissão
  score: number,                // 0-100, recalculado a cada aprovação de documento
  asoValido: boolean,           // true quando o ASO_ADMISSIONAL está APROVADO
  ctpsDigital: boolean,         // true quando a CTPS_DIGITAL está APROVADA
  createdAt: Date,
  updatedAt: Date,
}
```

Índices:

- `codigoFun` único
- `codigoHR` único
- `cpf` único
- `email` único
- `(status, departamento)` composite — listagem filtrada
- `createdAt` descendente — paginação default

### `documentos`

```ts
{
  _id: ObjectId,
  funcionarioId: ObjectId,
  tipo: 'RG' | 'CPF' | 'CTPS_DIGITAL' | 'ASO_ADMISSIONAL' | 'PIS' | 'COMPROVANTE_ENDERECO',
  status: 'PENDENTE' | 'APROVADO' | 'REJEITADO',
  storageKey: string,          // key no MinIO/S3
  nomeOriginal: string,
  mimeType: string,            // application/pdf | image/jpeg | image/png
  tamanhoBytes: number,
  enviadoPor: string,          // sub do JWT
  enviadoEm: Date,
  aprovadoPor: string | null,
  aprovadoEm: Date | null,
  motivoRejeicao: string | null,
  updatedAt: Date,
}
```

Índices: `(funcionarioId, enviadoEm desc)` e `(funcionarioId, status, tipo)`.

### `aprovacoes`

```ts
{
  _id: ObjectId,
  funcionarioId: ObjectId,
  tipo: 'ALTERACAO_CADASTRAL',
  status: 'PENDENTE' | 'APROVADA' | 'REJEITADA',
  camposAlterados: {
    telefone?: string,
    cargo?: string,
    departamento?: string,
    gestorId?: string | null,
  },
  solicitadoPor: string,
  solicitadoEm: Date,
  aprovadoPor: string | null,
  aprovadoEm: Date | null,
  motivoRejeicao: string | null,
  updatedAt: Date,
}
```

Índices: `(status, solicitadoEm desc)` e `(funcionarioId, solicitadoEm desc)`.

### `contadores`

```ts
{
  _id: string,                  // ex.: "funcionario:hr"
  valor: number,                // último valor emitido
}
```

Um documento por sequência. `proximoValor()` faz `findOneAndUpdate` com `$inc: { valor: 1 }` e `upsert: true`.

---

## Workflow de admissão (rules 1-8)

```
1. POST /funcionarios            [USUARIO]      → cria PENDENTE (score=0, asoValido=false, ctpsDigital=false)
2. POST /funcionarios/:id/documentos × 6  [USUARIO]  → primeiro upload promove PENDENTE → EM_VALIDACAO
3. (score recalculado após cada aprovação)
4. POST /documentos/:id/aprovar  [COORDENADOR] → marca APROVADO + recalcula score
   ou
   POST /funcionarios/:id/documentos/aprovar-pendentes  [COORDENADOR] → aprova TODOS de uma vez
5. PATCH + POST /aprovacoes/:id/aprovar  [USUARIO + COORDENADOR] → fluxo separado de alterações
6. Upload ASO_ADMISSIONAL (mesmo endpoint do passo 2, com tipo=ASO_ADMISSIONAL)
7. Última aprovação que satisfaz: score=100 + asoValido + ctpsDigital
8. Service transita automaticamente: EM_VALIDACAO → APROVADO → ATIVO
```

### Bulk approval (atalho do COORDENADOR)

```
POST /funcionarios/:id/documentos/aprovar-pendentes
  ↓
para cada documento com status=PENDENTE:
  marca APROVADO (atômico, com filtro PENDENTE — concorrência-safe)
recalcular score 1× no fim
se eSocial OK: promove EM_VALIDACAO → APROVADO → ATIVO

Response:
{
  "data": {
    "funcionarioId": "...",
    "aprovados": 6,         // quantos ESTE caller venceu
    "score": 100,
    "asoValido": true,
    "ctpsDigital": true,
    "statusFuncionario": "ATIVO"
  }
}
```

Idempotente: chamar 2× num funcionário sem pendentes retorna `aprovados: 0` com snapshot atual. Concorrência: 2 coordenadores chamando ao mesmo tempo — cada documento só é aprovado por um (a soma dos `aprovados` dos dois callers fecha com o total real).

### Pesos do score (soma = 100)

| Tipo                   | Peso |
| ---------------------- | ---: |
| `RG`                   |   10 |
| `CPF`                  |   10 |
| `CTPS_DIGITAL`         |   20 |
| `ASO_ADMISSIONAL`      |   30 |
| `PIS`                  |   10 |
| `COMPROVANTE_ENDERECO` |   20 |

Constantes em `src/modules/domain/score.ts`. Documentos REJEITADO não contam; em re-uploads, apenas o último APROVADO de cada tipo entra (aggregate `listarAprovadosPorTipo`).

### Aprovações cadastrais

`PATCH /funcionarios/:id` **não** aplica direto — cria uma `Aprovacao` PENDENTE. COORDENADOR aprova/rejeita via `/aprovacoes/:id/aprovar` ou `/aprovacoes/:id/rejeitar`. Campos aceitos: `telefone`, `cargo`, `departamento`, `gestorId`. CPF/email/códigos são imutáveis.

---

## Formato de erro (RFC 7807)

Todas as respostas de erro têm `Content-Type: application/problem+json`:

```json
{
  "type": "https://hr-core/errors/cpf-invalido",
  "title": "CPF inválido",
  "status": 422,
  "detail": "CPF informado não passou na validação de dígitos verificadores",
  "instance": "/funcionarios",
  "traceId": "8a1c4f63-9c2e-4f3b-9a2e-3f8c1d2b7a6e"
}
```

| Status | `type`                              | Quando                                                        |
| ------ | ----------------------------------- | ------------------------------------------------------------- |
| 400    | `validation`                        | Falha de schema Zod (campo `errors` com detalhes)             |
| 400    | `arquivo-ausente`                   | Upload multipart sem o campo `file`                           |
| 401    | `unauthorized`                      | Sem token, token inválido, expirado ou JWKS não encontrou kid |
| 403    | `insufficient-role`                 | Token válido mas role não autorizada para a rota              |
| 404    | `funcionario-nao-encontrado`        | Id válido mas inexistente                                     |
| 404    | `documento-nao-encontrado`          | Documento inexistente                                         |
| 404    | `aprovacao-nao-encontrada`          | Aprovação inexistente                                         |
| 404    | `not-found`                         | Rota inexistente                                              |
| 409    | `cpf-duplicado`                     | CPF já cadastrado em outro funcionário                        |
| 409    | `email-duplicado`                   | Email já cadastrado em outro funcionário                      |
| 409    | `funcionario-ja-desligado`          | Tentativa de desligar quem já está DESLIGADO                  |
| 409    | `documento-ja-processado`           | Aprovar/rejeitar documento já APROVADO ou REJEITADO           |
| 409    | `aprovacao-ja-processada`           | Aprovar/rejeitar aprovação já APROVADA ou REJEITADA           |
| 409    | `funcionario-inapto-para-alteracao` | PATCH em funcionário DESLIGADO/REPROVADO/INATIVO              |
| 413    | `arquivo-muito-grande`              | Upload acima de 10 MB                                         |
| 422    | `cpf-invalido`                      | CPF não passou na validação de dígitos verificadores          |
| 422    | `transicao-invalida`                | Transição de status proibida pelo workflow                    |
| 422    | `tipo-documento-invalido`           | Campo `tipo` do multipart fora do enum                        |
| 422    | `mime-type-nao-suportado`           | Arquivo fora de PDF/JPEG/PNG                                  |
| 422    | `sem-campos-para-alterar`           | PATCH sem nenhum campo editável                               |
| ≥ 500  | `internal`                          | Erro de servidor — `detail` genérico, não vaza internals      |

O header `X-Trace-Id` vindo do cliente é propagado no campo `traceId` (útil para correlação cross-service). Se ausente, o serviço gera um UUID v4.

---

## Observabilidade

### Logs (Pino)

Estruturado em JSON. Em `development`, formatado por `pino-pretty`. Campos garantidos:

- `service: "funcionario"`
- `reqId` / `traceId` — UUID v4 ou propagado via header `X-Trace-Id`
- `level`, `time`, `msg`
- Em erros de domínio: `code` (`cpf-invalido`, `cpf-duplicado`, etc.)

### Métricas (Prometheus)

`GET /metrics` expõe:

- **Default** (`prom-client`): CPU, memória, GC, eventloop lag, FDs
- **Por rota**: `http_request_duration_seconds` (histograma) e `http_request_summary_seconds` com labels `method`, `route`, `status_code`

### Tracing (OpenTelemetry → Tempo)

Quando `OTEL_ENABLED=true`:

- Auto-instrumenta `http`, `pino`, `mongodb`, `undici`
- Spans HTTP inbound + spans de query Mongo automaticamente
- `trace_id` injetado nos logs (via `instrumentation-pino`) para correlação log <-> trace no Grafana

---

## Stack local com Docker Compose

```bash
pnpm --filter @hr-core/funcionario compose:up
```

Sobe 8 containers:

| Container                            | Porta host     | Função                                                           |
| ------------------------------------ | -------------- | ---------------------------------------------------------------- |
| `hr-core-funcionario`                | `3002`         | O próprio funcionario-service (build local, `OTEL_ENABLED=true`) |
| `hr-core-funcionario-mongo`          | `27018`        | MongoDB 7 (volume persistente `mongo-data`)                      |
| `hr-core-funcionario-mongo-exporter` | _(interno)_    | mongodb_exporter — métricas do mongo para o Prometheus           |
| `hr-core-funcionario-minio`          | `9100`, `9101` | MinIO API + console web (login `minioadmin` / `minioadmin`)      |
| `hr-core-funcionario-minio-init`     | _(one-shot)_   | `mc mb` cria o bucket `hr-funcionario-documentos`                |
| `hr-core-funcionario-tempo`          | `3211`, `4329` | Grafana Tempo (HTTP API + OTLP HTTP)                             |
| `hr-core-funcionario-prometheus`     | `9092`         | Raspa `/metrics` a cada 15s                                      |
| `hr-core-funcionario-grafana`        | `3012`         | UI métricas + traces — login `administrador` / `1qaz2wsx12`      |

Portas escolhidas para **não colidir** com nenhum outro stack do monorepo:

| Stack         | Portas host ocupadas                                                                                                 |
| ------------- | -------------------------------------------------------------------------------------------------------------------- |
| `api-gateway` | `3000` (api), `3001` (grafana), `3200` (tempo), `4318` (otlp), `9090` (prom)                                         |
| `auth`        | `4000` (api), `3011` (grafana), `3210` (tempo), `4328` (otlp), `9091` (prom), `27017` (mongo)                        |
| `funcionario` | `3002` (api), `3012` (grafana), `3211` (tempo), `4329` (otlp), `9092` (prom), `27018` (mongo), `9100`/`9101` (minio) |

### Conexão com o Auth Service

O container do funcionario precisa alcançar o JWKS do auth. Por default, o `docker-compose.yml` aponta para `http://host.docker.internal:4000/.well-known/jwks.json` (com `extra_hosts: host-gateway` configurado), assumindo que o stack do auth está rodando no host. Para alterar:

```bash
AUTH_JWKS_URL=http://meu-auth-remoto/.well-known/jwks.json \
  pnpm --filter @hr-core/funcionario compose:up
```

### Validação rápida

```bash
# Health
curl http://localhost:3002/health
# → {"status":"ok","service":"funcionario","timestamp":"..."}

# Documentação interativa
open http://localhost:3002/docs

# Spec OpenAPI bruta
curl http://localhost:3002/docs/json | jq '.paths | keys'

# Tentativa sem auth → 401
curl -i -X POST http://localhost:3002/funcionarios \
  -H 'Content-Type: application/json' \
  -d '{"nome":"X","cpf":"111.444.777-35","email":"a@b","telefone":"1","cargo":"X","departamento":"X"}'
```

Para o fluxo autenticado completo, use o **Postman collection** na raiz do repo — o folder _Funcionario Service (direto :3002)_ tem todos os endpoints e o test script já preenche `{{funcionario_id_atual}}` automaticamente após o POST.

---

## Testes

```bash
pnpm --filter @hr-core/funcionario test                 # unit + integração (precisa do Mongo na 27018)
pnpm --filter @hr-core/funcionario test:coverage        # com relatório de cobertura
pnpm --filter @hr-core/funcionario e2e                  # E2E: sobe compose + roda vitest e2e + derruba
```

Thresholds de cobertura: lines/functions/statements **80%**, branches **75%**.

| Tipo       | Onde                                                     | O que cobre                                                                                 |
| ---------- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Unit       | `src/modules/domain/**/*.test.ts`                        | Cpf, codigoFun, codigoHR, DomainError, roles                                                |
| Integração | `src/modules/repositories/*.test.ts` + `src/app.test.ts` | Repos contra Mongo real (banco `hr-funcionarios-test`); app via `app.inject` com JWKS local |
| E2E        | `e2e/funcionario.e2e.test.ts`                            | Endpoints públicos + middleware de auth (sem tokens reais)                                  |

A suite de integração do app usa um **servidor JWKS local** (`test/jwks.ts`) que assina tokens com chaves RSA in-memory — assim a suite roda 100% isolada do Auth Service real.

---

## Roadmap

V1 cobre cadastro, workflow de admissão completo, documentos digitalizados, score eSocial e aprovações cadastrais. Próximos itens:

- [x] **Workflow de admissão** — máquina de estados PENDENTE → EM_VALIDACAO → APROVADO → ATIVO + REPROVADO
- [x] **Documentos** — upload multipart em MinIO/S3 + aprovação/rejeição pelo COORDENADOR
- [x] **Score eSocial automático** — pesos fixos por tipo, ativação quando score=100 + asoValido + ctpsDigital
- [x] **PATCH /funcionarios/:id** — via fluxo de aprovação cadastral
- [ ] **Evento Kafka `funcionario.created`** — publicar quando ATIVO; consumido por Notification + Dashboard
- [ ] **Evento Kafka `funcionario.desligado`** — para Auth desativar usuário associado
- [ ] **Histórico de cargo/departamento** — coleção `funcionario_historico` com eventos de mudança
- [ ] **Reativar funcionario DESLIGADO** — endpoint dedicado com `re-admissao` (preserva codigoHR original)
- [ ] **Validação de gestor circular** — impedir `gestorId` formar ciclo na hierarquia
- [ ] **Filtros avançados** — busca por nome (full-text), faixa de admissão
- [ ] **Soft delete reversível com janela de 30 dias** — antes de hard-delete via job
- [ ] **Manifestos Kubernetes** (Kustomize + Argo CD) — segue padrão do auth
- [ ] **Suite de carga** (k6) — POST /funcionarios + GET /funcionarios paginado
