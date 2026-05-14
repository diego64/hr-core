<!--
Título da PR: siga o mesmo formato do commit principal (Conventional Commits).
Exemplos:
  feat(gateway): documentar rotas via Swagger UI em /docs
  fix(ferias): impedir sobreposição de períodos para o mesmo funcionário
  refactor(auth): isolar JWKS cache em módulo próprio
  docs(gateway): seção Grafana — credenciais e dashboard no README
Escopos válidos estão em commitlint.config.cjs.
-->

## Sumário

<!-- 1 a 3 bullets respondendo: O QUE mudou e POR QUÊ (não o COMO). -->

-
-

## Tipo da mudança

<!-- Marque o tipo principal. Se houver mais de um, escolha o de maior impacto. -->

- [ ] `feat` — nova funcionalidade
- [ ] `fix` — correção de bug
- [ ] `refactor` — mudança de código sem alteração de comportamento
- [ ] `perf` — otimização de performance
- [ ] `docs` — apenas documentação
- [ ] `test` — adição ou ajuste de testes
- [ ] `chore` / `build` / `ci` — manutenção, build, pipeline
- [ ] `revert` — reverte commit anterior

**Escopo afetado:** <!-- gateway | auth | funcionario | ferias | avaliacao | folha-pagamento | notification | reports | dashboard | kafka | mongo | logger | jwt | domain | config | deps | ci | docs | release | workspace | tooling -->

## Contexto e motivação

<!--
O "porquê" por trás da mudança. Inclua:
- Problema/oportunidade que originou a PR
- Decisão arquitetural quando houver alternativa não-óbvia
- Trade-offs considerados
Se a motivação está em uma issue, basta um link em "Refs" abaixo + 1 linha de resumo aqui.
-->

## Mudanças principais

<!--
Lista de alterações relevantes agrupadas por arquivo ou módulo.
Não duplicar o diff — destacar APENAS o que precisa de atenção do revisor.
-->

- `caminho/do/arquivo.ts`: o que mudou e por quê
-

## Conformidade com CLAUDE.md

<!-- Marque o que se aplica. Itens não-aplicáveis podem ser deletados. -->

- [ ] Nenhuma regra de negócio adicionada ao API Gateway
- [ ] Acesso ao MongoDB feito via driver nativo (sem ORM)
- [ ] Evento Kafka publicado APENAS após confirmação de persistência
- [ ] Consumer group nomeado como `{service}-{topic}-group`
- [ ] Sem `console.log` em código de produção (logger estruturado do Fastify)
- [ ] Erros HTTP seguem RFC 7807 (`application/problem+json` com `traceId`)
- [ ] `strict: true` mantido — sem `any` sem justificativa explícita
- [ ] Banco/microsserviço não compartilhado com outro serviço
- [ ] `pnpm` usado (nunca `npm` / `yarn`)

## Validação

<!-- Marque o que foi executado localmente antes de abrir a PR. -->

- [ ] `pnpm typecheck` — sem erros
- [ ] `pnpm lint` — sem warnings novos
- [ ] `pnpm test` — todos os testes passando
- [ ] `pnpm test:coverage` — thresholds respeitados (≥80% services/domain)
- [ ] `pnpm test:e2e` — quando houver impacto em rota HTTP
- [ ] `pnpm build` — build de produção compila

### Verificação manual

<!-- Comandos executados + resultado esperado. Cole a saída resumida se relevante. -->

```bash
# Exemplo:
curl -s http://localhost:3000/health
# → {"status":"ok","service":"api-gateway","timestamp":"..."}
```

## Impacto

### Breaking change

- [ ] Não
- [ ] Sim — descreva o que quebra e por quê:

<!-- Se sim, o footer do commit deve conter `BREAKING CHANGE: <descrição>`. -->

### Migração necessária

- [ ] Nenhuma
- [ ] Sim — passos:

<!-- Migrações de banco, mudança de env, alteração de contrato Kafka, etc. -->

### Observabilidade

<!-- Marque o que se aplica. -->

- [ ] Métricas novas/alteradas: ...
- [ ] Logs novos/alterados: ...
- [ ] Dashboard atualizado (`docker/dashboards/`): ...
- [ ] Tracing/spans afetados: ...
- [ ] Não há impacto em observabilidade

### Eventos Kafka

- [ ] Não toca em Kafka
- [ ] Produz novo evento — tópico, schema, consumidores conhecidos:
- [ ] Consome novo evento — group ID, DLQ configurada:
- [ ] Altera payload de evento existente — **eventos são imutáveis**, criar versão nova (`evento.v2`) em vez de mudar o existente

### Segurança

- [ ] Não há mudança de superfície de segurança
- [ ] Toca em auth/JWT/JWKS/RBAC — descreva:
- [ ] Adiciona/remove rota pública (sem `authenticate`):
- [ ] Lida com segredos/credenciais — confirmar que não foram commitadas:

## Riscos e rollback

<!--
O que pode dar errado em produção e como reverter rapidamente.
Para PRs triviais (docs, refactor pequeno), basta "rollback via revert".
-->

**Riscos identificados:**

- **Rollback:**

- [ ] `git revert <commit>` é suficiente
- [ ] Requer ação adicional — descreva:

## Screenshots / saídas

<!--
Para mudanças de UI, Swagger UI, dashboard Grafana, ou contrato HTTP.
Cole curl + resposta, ou print do antes/depois.
-->

## Refs

<!--
Closes #123          — fecha a issue automaticamente quando o PR for mergeado
Relates to #456      — relacionado mas não fecha
Co-Authored-By: ...  — colaboradores
-->

- ***

<!--
Checklist do revisor (preenchido na review, não pelo autor):

- [ ] Conformidade com CLAUDE.md verificada
- [ ] Testes cobrem cenários positivos E negativos
- [ ] Logs estruturados com traceId em pontos relevantes
- [ ] Sem regressão de performance/observabilidade
- [ ] Documentação (README do serviço, OpenAPI, CHANGELOG) atualizada
-->
