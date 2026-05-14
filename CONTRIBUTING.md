# Contribuindo com o HR Core

Bem-vindo. Este guia descreve o **processo de contribuição**: como nomear branches, como escrever commits, como abrir PRs e como o código entra na `main`. Para padrões **arquiteturais** (estrutura de microsserviço, regras de negócio, etc.), veja [`CLAUDE.md`](./CLAUDE.md).

---

## Sumário

- [Quick start](#quick-start)
- [Pré-requisitos](#pré-requisitos)
- [Setup local](#setup-local)
- [Fluxo de trabalho](#fluxo-de-trabalho)
- [Convenções de branch](#convenções-de-branch)
- [Padrão de commits](#padrão-de-commits)
- [Padrão de Pull Request](#padrão-de-pull-request)
- [Padrões de código](#padrões-de-código)
- [Testes](#testes)
- [Ferramentas locais](#ferramentas-locais)
- [Antes de pedir review](#antes-de-pedir-review)
- [Política de merge](#política-de-merge)
- [Reportando bugs e propondo features](#reportando-bugs-e-propondo-features)

---

## Quick start

```bash
git clone <repo>
cd hr-core
pnpm install                 # instala deps + ativa husky + configura git commit.template
git checkout -b feature/<scope>/<assunto-kebab>
# ... codifica, commita atomicamente ...
git push -u origin <branch>
gh pr create                 # template auto-preenche
```

> Se faltar contexto sobre arquitetura/regras de negócio, **leia [`CLAUDE.md`](./CLAUDE.md) primeiro**. Este guia presume que você já conhece o domínio.

---

## Pré-requisitos

| Ferramenta | Versão       | Por quê                                          |
| ---------- | ------------ | ------------------------------------------------ |
| Node.js    | ≥ 22.11.0    | Definido em `engines.node`                       |
| pnpm       | ≥ 11.0.0     | Workspace manager — `npm` e `yarn` são proibidos |
| Docker     | ≥ 24         | Para a stack local de observabilidade (compose)  |
| `gh` CLI   | qualquer 2.x | Recomendado para abrir PRs do terminal           |
| `git`      | ≥ 2.30       | Suporte a hooks modernos                         |

Não use `npm install` nem `yarn` — o `pnpm` é exigido pelo `packageManager` do `package.json` e pela estrutura de workspace.

---

## Setup local

```bash
pnpm install
```

O `pnpm install` executa automaticamente o script `prepare`, que:

1. Instala os hooks do husky (`.husky/_/`)
2. Configura `git config commit.template .gitmessage.txt` neste repo

Depois disso:

- `git commit` (sem `-m`) abre o editor com o esqueleto do commit
- Cada commit passa pelo `commit-msg` hook (commitlint)
- Cada commit passa pelo `pre-commit` hook (lint-staged: ESLint + Prettier nos arquivos staged)

Para subir a stack local de observabilidade do api-gateway:

```bash
cd services/api-gateway
pnpm compose:up
# Grafana: http://localhost:3001 — administrador / 1qaz2wsx12
```

---

## Fluxo de trabalho

```
issue ──────────────────────────────────────────────────────────────┐
                                                                     ▼
1. Branch a partir de develop      git checkout -b feature/<scope>/<assunto>
   │
2. Commits atômicos                cada commit = 1 mudança lógica revertível
   │                               rode `pnpm typecheck && pnpm test` antes
   │
3. Rebase em develop               git fetch && git rebase origin/develop
   │                               resolva conflitos AGORA, não na PR
   │
4. Push                            git push -u origin <branch>
   │
5. PR via gh                       gh pr create  (template auto-preenche)
   │
6. CI verde                        lint + typecheck + test + build
   │
7. Code review                     reaja com NOVOS commits (não force-push)
   │
8. Merge                           squash se a história está suja;
                                   merge commit se cada commit é valioso
```

Cada passo está detalhado nas seções abaixo.

---

## Convenções de branch

Formato:

```
<categoria>/<scope>/<assunto-kebab-curto>
```

| Categoria   | Quando usar                                        |
| ----------- | -------------------------------------------------- |
| `feature/`  | Nova funcionalidade                                |
| `fix/`      | Correção de bug                                    |
| `refactor/` | Mudança sem alteração de comportamento             |
| `chore/`    | Manutenção, deps, configs                          |
| `docs/`     | Apenas documentação                                |
| `hotfix/`   | Correção urgente direto em `main` (pula `develop`) |
| `release/`  | Preparação de release (bump de versão, changelog)  |

**Escopo (`<scope>`)** segue a mesma enum do commitlint: `gateway`, `auth`, `funcionario`, `ferias`, `avaliacao`, `folha-pagamento`, `notification`, `reports`, `dashboard`, `kafka`, `mongo`, `logger`, `jwt`, `domain`, `config`, `deps`, `ci`, `docs`, `release`, `workspace`, `tooling`.

**Exemplos válidos:**

```
feature/gateway/swagger-docs
fix/ferias/sobreposicao-periodos
refactor/auth/extrair-jwks-cache
chore/deps/atualizar-fastify-5.8
docs/gateway/grafana-credenciais
hotfix/auth/token-revogado-aceito
```

**Evite:**

```
diego/nova-feature          ← sem scope/categoria
feature/swagger             ← sem scope
feat-gateway-swagger        ← sem hierarquia /
```

Branch base default: **`develop`**. PRs vão de `feature/*` → `develop` → `main` (release).

---

## Padrão de commits

Convencional Commits, validado pelo `commitlint.config.cjs`. O esqueleto está em [`.gitmessage.txt`](./.gitmessage.txt) e abre automaticamente em `git commit` (sem `-m`).

### Formato

```
<type>(<scope>): <subject>

<body opcional — POR QUÊ, não O QUÊ. Linhas ≤ 120 chars.>

<footer opcional — BREAKING CHANGE, Refs, Co-Authored-By>
```

### Regras (enforçadas pelo commitlint)

- `subject` em **minúsculo**, **imperativo**, **sem ponto final**
- Header total (`type(scope): subject`) ≤ **100 chars**
- Linhas do body ≤ **120 chars**
- `scope` em **kebab-case**, da enum válida
- `type` da lista abaixo

### Tipos

| Tipo       | Quando usar                                                |
| ---------- | ---------------------------------------------------------- |
| `feat`     | Nova funcionalidade visível ao usuário/cliente             |
| `fix`      | Correção de bug                                            |
| `refactor` | Mudança de código sem alteração de comportamento externo   |
| `perf`     | Otimização de performance                                  |
| `docs`     | Apenas documentação (README, CLAUDE.md, comentários)       |
| `test`     | Adição/ajuste de testes                                    |
| `build`    | Build, dependências, Dockerfile, tsconfig                  |
| `ci`       | Pipelines CI/CD, GitHub Actions, Argo CD                   |
| `chore`    | Manutenção sem impacto em `src/`                           |
| `style`    | Formatação (raro com Prettier ativo)                       |
| `revert`   | Reverte commit anterior — body deve citar o hash revertido |

### Breaking change

Duas formas equivalentes (ambas disparam bump major em SemVer):

```
feat(auth)!: remover validação local de JWT em favor do JWKS

BREAKING CHANGE: variável AUTH_PUBLIC_KEY removida. Configurar
AUTH_JWKS_URL apontando para o endpoint do Auth Service.
```

O `!` antes do `:` é o marcador visual; o `BREAKING CHANGE:` no footer é o que importa pra ferramentas (semantic-release etc.).

### Exemplos

**Simples (só subject):**

```
fix(gateway): corrigir typo no log de boot
```

**Com body explicando o porquê:**

```
fix(ferias): impedir sobreposição de períodos para o mesmo funcionário

Antes, dois períodos podiam coexistir se a requisição chegasse
simultaneamente — a checagem era pré-insert sem lock. Agora a
verificação roda em transação com índice único composto
(funcionarioId + período).

Refs: #128
```

**Com footer:**

```
refactor(auth): isolar JWKS cache em módulo próprio

Move a criação do remoteJWKSet para src/auth/jwks.ts. Permite
testar o cache isoladamente e abre espaço para o consumer de
token.revoked compartilhar a mesma instância.

Refs: HR-42
Co-Authored-By: Maria <maria@hr-core.local>
```

### Anti-padrões

```
❌ wip
❌ ajustes
❌ fix
❌ feat: adicionei swagger.            ← passado + ponto final
❌ FEAT(GATEWAY): SWAGGER              ← caixa alta
❌ feat(gateway): adicionar swagger... ← reticências escondem subject vago
❌ feat: gateway swagger               ← scope no lugar do tipo
❌ feat(api-gateway): ...              ← scope fora da enum (é "gateway")
```

---

## Padrão de Pull Request

O template em [`.github/pull_request_template.md`](./.github/pull_request_template.md) é injetado automaticamente em toda PR nova (via UI do GitHub e `gh pr create`). Preencha **todas as seções aplicáveis** e remova as que não fazem sentido para esta mudança.

### Título da PR

Mesmo formato do commit principal — Conventional Commits:

```
feat(gateway): documentar rotas via Swagger UI em /docs
```

O título vira o assunto do commit de merge (se squash) ou da release note (semantic-release).

### Seções obrigatórias

1. **Sumário** — 1 a 3 bullets, O QUE + POR QUÊ
2. **Tipo da mudança** — checkbox + escopo
3. **Validação** — confirmação de typecheck/test/build
4. **Impacto** — pelo menos marcar "não há" em cada subseção
5. **Refs** — link da issue (`Closes #N`) ou ticket externo

### Seções condicionais (preencher quando aplicável)

- **Conformidade com CLAUDE.md** — para mudanças que tocam em arquitetura ou regra arquitetural
- **Mudanças principais** — se o diff tem mais de 5 arquivos significativos
- **Riscos e rollback** — qualquer coisa que vai pra prod
- **Screenshots / curl** — UI, Swagger, dashboard, contrato HTTP
- **Eventos Kafka** — sempre que toca em producer/consumer
- **Segurança** — sempre que toca em auth, secrets, headers

### Tamanho de PR

| Linhas alteradas | Tratamento                                        |
| ---------------- | ------------------------------------------------- |
| < 50             | Review rápida                                     |
| 50 – 300         | Tamanho ideal                                     |
| 300 – 800        | Aceitável se for uma feature coesa                |
| > 800            | Considere quebrar em PRs encadeadas (stacked PRs) |

PR gigante (>800 linhas) **não é proibido** mas exige justificativa no body (ex.: "feature precisa ser atômica para não quebrar consumers Kafka durante o deploy").

---

## Padrões de código

Detalhes arquiteturais — incluindo padrões de TypeScript, MongoDB driver nativo, Kafka, Fastify, logs estruturados e RFC 7807 — estão em [`CLAUDE.md`](./CLAUDE.md). Resumo aqui só dos pontos que afetam **review de PR**:

- ✅ **Sem `any`** sem comentário explicando por quê
- ✅ **Sem `console.log`** em código de produção — usar `request.log` ou logger do Fastify
- ✅ **Sem ORM** (Mongoose, Prisma) — driver nativo `mongodb` apenas
- ✅ **Sem `npm`/`yarn`** — `pnpm` exclusivo
- ✅ **Sem regra de negócio no API Gateway** — apenas auth, rate limit, validação, roteamento
- ✅ **Erros HTTP em RFC 7807** (`application/problem+json` com `traceId`)
- ✅ **Eventos Kafka publicados após persistência**, nunca antes
- ✅ **Eventos são imutáveis** — payload não muda depois de publicado (criar `evento.v2` se precisar)
- ✅ **`strict: true`** mantido no `tsconfig.json`
- ✅ **Imports relativos com extensão `.js`** (exigência do `module: NodeNext`)

---

## Testes

| Tipo       | Quando incluir na PR                                   |
| ---------- | ------------------------------------------------------ |
| Unitário   | Sempre que tocar em `services/`, `domain/`, `utils/`   |
| Integração | Sempre que tocar em `repositories/` (MongoDB real)     |
| E2E        | Sempre que tocar em rota HTTP exposta                  |
| Carga (k6) | Quando alterar endpoint crítico (auth, ferias.approve) |

### Cobertura mínima

- **Lines:** 80% em `services/` e `domain/`
- **Functions:** 80%
- **Branches:** 75%

CI bloqueia merge se cair abaixo. Para rodar localmente:

```bash
pnpm --filter @hr-core/<servico> test:coverage
```

### Regras

- Service method novo → teste unitário correspondente **na mesma PR**
- Repository novo → teste de integração com MongoDB real (test container), **sem mocks de MongoDB**
- Rota nova → teste E2E cobrindo cenário positivo + pelo menos 1 erro (401/400/500)
- Bug fix → teste que **falha no commit anterior ao fix** e passa depois (regression test)

---

## Ferramentas locais

| Comando                     | Função                                             |
| --------------------------- | -------------------------------------------------- |
| `pnpm typecheck`            | `tsc --noEmit` recursivo em todos os workspaces    |
| `pnpm test`                 | Vitest em todos os workspaces                      |
| `pnpm build`                | Build de produção (gera `dist/` em cada workspace) |
| `pnpm lint`                 | ESLint na raiz                                     |
| `pnpm lint:fix`             | ESLint com `--fix`                                 |
| `pnpm format`               | Prettier `--write`                                 |
| `pnpm format:check`         | Prettier `--check` (não modifica)                  |
| `pnpm --filter <pkg> <cmd>` | Roda comando em workspace específico               |

### Hooks ativos

- **`commit-msg`**: `commitlint` valida formato Conventional Commits
- **`pre-commit`**: `lint-staged` roda `eslint --fix` + `prettier --write` nos arquivos staged

Não use `--no-verify` para pular hooks. Se um hook falhar, **corrija a causa**, não contorne.

---

## Antes de pedir review

Checklist mental que evita ida e volta com o revisor:

- [ ] Rebaseei em `develop` recente (sem conflitos pendentes)
- [ ] `pnpm typecheck` passa
- [ ] `pnpm test` passa
- [ ] `pnpm lint` sem warnings novos
- [ ] Cobertura ≥ thresholds do projeto
- [ ] Título da PR no formato Conventional Commits
- [ ] Template de PR preenchido (incluindo "Validação" e "Refs")
- [ ] Se mexeu em rota HTTP, atualizei a Swagger UI / OpenAPI
- [ ] Se mexeu em env, atualizei `.env.example` e o README do serviço
- [ ] Se mexeu em evento Kafka, atualizei a tabela "Kafka — Eventos Principais" do CLAUDE.md
- [ ] Se a mudança é "breaking", marcado no commit (`!`) + footer (`BREAKING CHANGE:`)
- [ ] Sem `console.log`, `debugger`, `TODO` órfão, `any` sem justificativa

---

## Política de merge

| Cenário                                                   | Estratégia recomendada               |
| --------------------------------------------------------- | ------------------------------------ |
| Branch com 1–8 commits coerentes, cada um conta uma etapa | **Merge commit** (preserva história) |
| Branch com muitos commits "WIP", "fix typo", "again"      | **Squash and merge**                 |
| Hotfix urgente, 1 commit focado                           | **Squash** (limpa história)          |
| Branch de release (`release/v1.2`) consolidando features  | **Merge commit**                     |

A pessoa que cuida do merge escolhe — não há regra rígida. Critério: **a história em `develop` deve ser navegável** (`git log --oneline`) sem ruído.

### Pós-merge

- Argo CD detecta a mudança em `main` e dispara sync automático
- Branch source pode ser deletada (`gh pr merge --delete-branch`)
- Issue linkada via `Closes #N` fecha automaticamente

---

## Reportando bugs e propondo features

Use **GitHub Issues**. Formato sugerido:

### Bug

```markdown
**Descrição:** o que está acontecendo
**Reprodução:** passos numerados
**Esperado:** comportamento esperado
**Atual:** comportamento observado
**Ambiente:** versão do serviço, env (dev/staging/prod)
**Logs/traceId:** se aplicável
```

### Feature

```markdown
**Problema:** que dor isso resolve
**Solução proposta:** abordagem (ou "discussão aberta")
**Alternativas consideradas:** outras opções e por que foram descartadas
**Impacto:** quais serviços/equipes mudam
```

---

## Dúvidas

- Arquitetura, regras de negócio, padrões de microsserviço → [`CLAUDE.md`](./CLAUDE.md)
- Configuração do api-gateway → [`services/api-gateway/README.md`](./services/api-gateway/README.md)
- Padrões de commit (formato exato + escopos válidos) → [`commitlint.config.cjs`](./commitlint.config.cjs)
- Template de commit → [`.gitmessage.txt`](./.gitmessage.txt)
- Template de PR → [`.github/pull_request_template.md`](./.github/pull_request_template.md)

Não achou? Pergunte no canal `#hr-core-dev` no Slack ou marque alguém da lista em `CODEOWNERS` (quando existir).
