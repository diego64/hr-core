import { defineConfig } from 'vitest/config'

/**
 * Config separada para integration + e2e tests — usa Mongo real via
 * testcontainers (lento, não roda em paralelo) e config de auth via
 * JWKS local em-memória (jwt-harness).
 *
 * Includes:
 *   - src/**\/*.integration.test.ts — colocado junto do código (cobre repositories)
 *   - e2e/**\/*.e2e.test.ts         — fluxos HTTP completos via app.inject
 *
 * Comandos:
 *   pnpm test                  → unit (rápido, sem Docker)
 *   pnpm test:integration      → integration + e2e (precisa de Docker)
 *
 * O `setupFiles` é diferente do unit — não define MONGO_URL fake porque
 * cada suite pega URI do testcontainer e injeta antes de buildApp().
 */
export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
    include: ['src/**/*.integration.test.ts', 'e2e/**/*.e2e.test.ts'],
    setupFiles: ['./test/integration-setup.ts'],
    testTimeout: 60_000,
    hookTimeout: 60_000,
    fileParallelism: false,
  },
})
