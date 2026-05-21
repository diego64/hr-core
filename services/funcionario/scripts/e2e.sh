#!/usr/bin/env bash
# Orquestra a suite E2E do Funcionario Service:
#   1. Sobe a stack via docker-compose (funcionario + mongo + obs)
#   2. Aguarda /health responder 200
#   3. Roda `vitest --config vitest.e2e.config.ts`
#   4. Derruba a stack (trap garante limpeza mesmo em falha)
#
# IMPORTANTE: o stack do Funcionario precisa do JWKS do Auth Service. Antes
# de rodar este script, suba o stack do auth (`pnpm --filter @hr-core/auth e2e`
# ou `docker compose --project-directory services/auth -f .../docker-compose.yml up -d`)
# OU defina AUTH_JWKS_URL pra um endpoint acessível.
#
# Variáveis de override:
#   KEEP_UP=1                — não derrubar ao final (debug)
#   SKIP_BUILD=1             — reutilizar imagem já buildada
#   HEALTH_TIMEOUT=90        — timeout em segundos esperando /health
#   FUNCIONARIO_BASE_URL     — apontar a suite pra uma stack já em pé
#   AUTH_JWKS_URL            — sobrescreve URL do JWKS no compose

set -euo pipefail

cd "$(dirname "$0")/.."

HEALTH_TIMEOUT="${HEALTH_TIMEOUT:-90}"
COMPOSE="docker compose --project-directory . -f docker-compose.yml"

cleanup() {
  if [[ "${KEEP_UP:-0}" == "1" ]]; then
    echo "→ KEEP_UP=1, stack mantida em pé"
    return
  fi
  echo "→ derrubando stack…"
  $COMPOSE down -v --remove-orphans >/dev/null 2>&1 || true
}

# Se FUNCIONARIO_BASE_URL está setado, presume stack externa — só roda os testes
if [[ -n "${FUNCIONARIO_BASE_URL:-}" ]]; then
  echo "→ usando stack externa em $FUNCIONARIO_BASE_URL (sem subir/derrubar)"
  exec pnpm vitest run --config vitest.e2e.config.ts
fi

trap cleanup EXIT

if [[ "${SKIP_BUILD:-0}" == "1" ]]; then
  echo "→ subindo stack (sem rebuild)…"
  $COMPOSE up -d
else
  echo "→ subindo stack (com rebuild)…"
  $COMPOSE up -d --build
fi

echo "→ aguardando /health responder 200 (timeout ${HEALTH_TIMEOUT}s)…"
deadline=$(( $(date +%s) + HEALTH_TIMEOUT ))
until curl -fsS http://localhost:3002/health >/dev/null 2>&1; do
  if (( $(date +%s) >= deadline )); then
    echo "✗ timeout esperando /health"
    $COMPOSE logs --tail 30 funcionario-service
    exit 1
  fi
  sleep 1
done
echo "✓ /health OK"

echo "→ rodando vitest e2e…"
pnpm vitest run --config vitest.e2e.config.ts
