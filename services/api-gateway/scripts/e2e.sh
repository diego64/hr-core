#!/usr/bin/env bash
# Sobe a stack do docker-compose, espera o gateway ficar saudável, roda os
# testes E2E (Vitest) contra ele, e DERRUBA tudo no final — independente do
# resultado dos testes. Saída: 0 = tudo OK, !=0 = falha em algum passo.
#
# Uso:
#   ./scripts/e2e.sh             # build da imagem + up + test + down
#   KEEP_UP=1 ./scripts/e2e.sh   # mantém a stack viva ao final (útil para debug)
#   SKIP_BUILD=1 ./scripts/e2e.sh  # reutiliza a imagem existente

set -euo pipefail

cd "$(dirname "$0")/.."

COMPOSE="docker compose --project-directory . -f docker-compose.yml"
GATEWAY_URL="${E2E_BASE_URL:-http://localhost:3000}"
HEALTH_TIMEOUT="${HEALTH_TIMEOUT:-90}"

cleanup() {
  local exit_code=$?
  if [[ "${KEEP_UP:-0}" == "1" ]]; then
    echo "→ KEEP_UP=1, mantendo stack ativa (rodar manualmente: ${COMPOSE} down -v)"
    exit "$exit_code"
  fi
  echo "→ Derrubando stack (volumes inclusos)..."
  ${COMPOSE} down -v --remove-orphans >/dev/null 2>&1 || true
  exit "$exit_code"
}
trap cleanup EXIT

echo "→ Subindo stack..."
if [[ "${SKIP_BUILD:-0}" == "1" ]]; then
  ${COMPOSE} up -d
else
  ${COMPOSE} up -d --build
fi

echo "→ Aguardando ${GATEWAY_URL}/health (timeout ${HEALTH_TIMEOUT}s)..."
start_time=$(date +%s)
while true; do
  if curl --silent --fail --max-time 2 "${GATEWAY_URL}/health" >/dev/null 2>&1; then
    elapsed=$(( $(date +%s) - start_time ))
    echo "  ✓ Gateway saudável após ${elapsed}s"
    break
  fi
  elapsed=$(( $(date +%s) - start_time ))
  if (( elapsed >= HEALTH_TIMEOUT )); then
    echo "  ✗ Timeout esperando o gateway. Últimos logs:"
    ${COMPOSE} logs --tail=80 api-gateway || true
    exit 1
  fi
  sleep 1
done

echo "→ Rodando suite E2E..."
E2E_BASE_URL="${GATEWAY_URL}" pnpm exec vitest run --config vitest.e2e.config.ts
