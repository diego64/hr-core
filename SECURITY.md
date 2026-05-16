# Política de Segurança

O HR Core processa dados sensíveis de Recursos Humanos — informações pessoais identificáveis (PII), folha de pagamento, avaliações de desempenho. Levamos vulnerabilidades a sério e oferecemos um canal privado de reporte.

> ⚠️ **Não abra issues públicas para falhas de segurança.** Use o canal privado descrito em [Como reportar](#como-reportar).

---

## Sumário

- [Escopo](#escopo)
- [Versões suportadas](#versões-suportadas)
- [Como reportar](#como-reportar)
- [O que esperar do nosso time](#o-que-esperar-do-nosso-time)
- [Severidade e SLA de resposta](#severidade-e-sla-de-resposta)
- [Política de divulgação](#política-de-divulgação)
- [Safe harbor — pesquisa de segurança](#safe-harbor--pesquisa-de-segurança)
- [Áreas de atenção (mais sensíveis)](#áreas-de-atenção-mais-sensíveis)
- [Boas práticas para contribuidores](#boas-práticas-para-contribuidores)

---

## Escopo

### Dentro do escopo

- Código deste repositório (`hr-core`), todas as branches publicadas
- Imagens Docker oficiais publicadas a partir deste repo
- Manifestos de deploy / Helm / Argo CD (quando existirem) presentes no repo

### Fora do escopo

- Sites de marketing institucional ou documentação externa
- Instâncias self-hosted operadas por terceiros (clientes SaaS)
- Dependências de terceiros — reporte ao maintainer original e, paralelamente, nos avise para aplicar mitigação
- Ataques de engenharia social, phishing direcionado a colaboradores, ataques físicos
- Denial-of-Service de qualquer natureza (volumetria, lentidão de proxy etc.)

---

## Versões suportadas

Enquanto o projeto está pré-1.0 (`0.x`), apenas a **versão mais recente** (`main` HEAD) recebe correções de segurança. A partir de 1.0, a política passa a ser:

| Versão   | Status                              |
| -------- | ----------------------------------- |
| `main`   | ✅ Corrigida ativamente             |
| `latest` | ✅ Corrigida ativamente             |
| `N-1`    | ✅ Corrigida (releases major em N)  |
| `< N-1`  | ❌ Sem suporte — atualizar para `N` |

---

## Como reportar

### Canal preferencial

E-mail para **`diegoferreira1964@gmail.com`**.

Inclua no e-mail:

1. **Descrição** clara do problema
2. **Passos para reproduzir** — comandos `curl`, payloads, sequência de cliques. Se o exploit envolver código, anexe arquivo (não cole inline se for muito longo)
3. **Impacto observado** — o que um atacante consegue fazer
4. **Versão / commit** afetada
5. **Sugestão de mitigação** (opcional, mas ajuda na priorização)
6. **Seu nome / handle público** se quiser ser creditado na nota de divulgação

### PGP (opcional)

Para reportes especialmente sensíveis, use a chave PGP em `security/pgp-key.asc` (será adicionada quando o canal estiver formalmente operacional).

Fingerprint: `<a ser publicado>`

### Reporte alternativo

Se o e-mail não estiver disponível, abra um **Private Vulnerability Report** pelo GitHub:

1. Aba **Security** do repositório
2. **Report a vulnerability**
3. Apenas maintainers terão acesso

> Não use Issues públicas, Discussions, Pull Requests ou Slack para discutir vulnerabilidades não-corrigidas. Mesmo após a correção, aguarde nossa publicação coordenada antes de tornar público.

---

## O que esperar do nosso time

| Prazo                   | Compromisso                                                                          |
| ----------------------- | ------------------------------------------------------------------------------------ |
| **Em 3 dias úteis**     | Confirmação de recebimento e abertura de ticket interno                              |
| **Em 7 dias úteis**     | Triagem inicial — confirmamos se é vulnerabilidade real, classificamos a severidade  |
| **Conforme severidade** | Correção desenvolvida e deploy coordenado (ver [SLA](#severidade-e-sla-de-resposta)) |
| **Pós-correção**        | Nota de divulgação publicada; crédito ao reporter (se desejado)                      |

Mantemos comunicação contínua com você ao longo do processo. Se ficar mais de 7 dias úteis sem resposta nossa, **pode reescalar** abrindo um Private Vulnerability Report no GitHub mencionando a thread anterior.

---

## Severidade e SLA de resposta

Usamos uma adaptação do **CVSS 3.1** para classificar. SLAs contam a partir da confirmação da vulnerabilidade.

| Severidade | CVSS    | Exemplos                                                                                      | SLA de correção           |
| ---------- | ------- | --------------------------------------------------------------------------------------------- | ------------------------- |
| 🔴 Crítica | 9.0–10  | RCE, bypass total de auth, leak de PII em massa, escalation para admin                        | **≤ 7 dias corridos**     |
| 🟠 Alta    | 7.0–8.9 | Bypass parcial de auth/RBAC, leak de PII de usuário específico, IDOR, SSRF, JWT mal validado  | **≤ 14 dias corridos**    |
| 🟡 Média   | 4.0–6.9 | XSS limitado, CSRF em endpoint não-crítico, exposição de stack trace, leak de header sensível | **≤ 30 dias corridos**    |
| 🟢 Baixa   | < 4.0   | Falha de configuração defensiva, info disclosure menor, missing header de segurança           | **Próximo ciclo (≤ 60d)** |

Crítica e alta disparam **deploy emergencial** (fora do ciclo normal de release).

---

## Política de divulgação

Praticamos **disclosure coordenado**:

1. Reporter envia detalhes pelo canal privado
2. Confirmamos, classificamos, desenvolvemos correção
3. Deploy em produção (ambientes operados por nós) é feito primeiro
4. Janela de **embargo de 14 dias** após correção, para clientes auto-hospedados atualizarem
5. Nota de divulgação pública é publicada no `CHANGELOG.md` + GitHub Security Advisory
6. Reporter recebe crédito (se quiser) e, quando aplicável, CVE é solicitado

Se durante a triagem você divulgar publicamente antes do embargo, o crédito é removido e o caso pode ser tratado fora da política de safe harbor.

---

## Safe harbor — pesquisa de segurança

Você está autorizado a fazer pesquisa de segurança neste código se:

- ✅ Reportar pelo canal privado, dando tempo razoável para corrigirmos antes de divulgação
- ✅ Realizar testes apenas no **seu próprio ambiente** (clone local, instância dedicada)
- ✅ Não acessar, modificar ou exfiltrar dados de outros usuários
- ✅ Não fazer DoS, fuzz volumétrico ou spam contra infra de produção
- ✅ Cumprir as leis locais aplicáveis

Cumprindo o acima, **não vamos perseguir ação legal** contra a sua pesquisa de boa-fé.

---

## Áreas de atenção (mais sensíveis)

Estas áreas concentram a maior parte do risco e merecem foco extra:

### Autenticação e autorização

- `services/auth/` — emissão de tokens, refresh rotation, revogação
- `services/api-gateway/src/plugins/auth.ts` — validação de JWT via JWKS
- `services/api-gateway/src/plugins/rbac.ts` — controle de roles
- Qualquer rota cujo `preHandler` inclua `fastify.authenticate`

Cuidados específicos:

- JWT validado com `iss`, `aud`, `exp` (já enforçado pelo `jose.jwtVerify`)
- Refresh tokens armazenados **só como hash** no banco (não em claro)
- Rotação de refresh token: reutilização → revogação em cascata de **todos** os tokens do usuário
- Hash de senha com `crypto.scrypt` (nativo Node, conforme CLAUDE.md) — sem bcrypt por padrão

### Headers propagados ao downstream

`api-gateway/src/routes/proxy.ts` injeta `x-user-id` e `x-user-roles` para os microsserviços. Isso é **Zero Trust** consciente — cada serviço pode re-validar JWT localmente. Nunca confie no `x-user-id` se a rota não passou por `fastify.authenticate`.

### Eventos Kafka

- Eventos com PII (ex.: `funcionario.created`) **não devem incluir CPF, salário ou outros dados sensíveis no payload** — apenas IDs. O consumidor busca no banco se precisar do dado completo
- Tópicos com dados sensíveis precisam de ACL no broker (não há cliente público no Kafka)
- Eventos são imutáveis: payload publicado **nunca** muda. Vulnerabilidade descoberta em evento já publicado exige nova versão (`evento.v2`)

### Segredos e configuração

- `.env` **nunca** é commitado (gitignore obrigatório)
- `.env.example` contém apenas valores fictícios
- Em produção, segredos vêm de Vault / AWS Secrets Manager / similar — nunca de envs hardcoded no Helm
- **Credenciais locais documentadas** (ex.: Grafana `administrador / 1qaz2wsx12` no `docker-compose.yml`) são **apenas para dev local**. Antes de qualquer deploy externo, substituir por valores fortes vindos de secret manager

### Endpoints públicos do gateway

`/health`, `/ready`, `/metrics`, `/docs`, `/docs/json` não exigem auth. Avalie:

- **`/metrics`**: pode vazar estrutura interna (rotas, status codes). Em prod pública, expor apenas via ingress interno
- **`/docs`**: idem — `SWAGGER_ENABLED=false` em prod pública, ou ingress restrito
- **`/health` / `/ready`**: nada sensível por design

---

## Boas práticas para contribuidores

Ao mexer em código:

- ✅ Validação de input em **todo** endpoint (Zod no gateway, Zod nos serviços)
- ✅ Output encoding — nunca interpolar input em strings de log/SQL/HTML
- ✅ Sem `console.log(payload)` em produção — logs estruturados, com **redaction** de campos sensíveis no logger do Pino
- ✅ Mensagens de erro 5xx **nunca propagam stack/internals** ao cliente (já enforçado em `middlewares/error-handler.ts`)
- ✅ Dependências auditadas regularmente: `pnpm audit` no CI
- ✅ Pinning de versões críticas (auth/crypto/JWT) — sem ranges abertos (`^`) em produção
- ✅ Headers de segurança em respostas HTTP (Helmet — no roadmap do gateway)
- ✅ Em qualquer log com identidade do usuário, usar `sub` do JWT, **nunca** o token completo

Ao revisar PR (especialmente as marcadas com escopo `auth`, `jwt`, ou que toquem em `**/auth.ts`):

- ❌ Mudou validação de token? Confirmar que `iss`, `aud`, `exp` continuam validados
- ❌ Adicionou rota pública? Confirmar que **não retorna nada que precise de auth** (sem PII, sem segredos, sem indicadores de existência de recursos)
- ❌ Mudou serialização de erro? Confirmar que 5xx não vaza internals (`detail` genérico)
- ❌ Adicionou env nova? Confirmar que vai pra `.env.example` com placeholder, **não** com valor real

---

## Histórico de divulgações

Atualizado conforme vulnerabilidades são corrigidas e o embargo expira. Cross-referência com `CHANGELOG.md`.

_Sem divulgações registradas até o momento._
