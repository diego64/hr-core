import { defineConfig } from 'vitest/config'

// Configuração isolada para a suite E2E — roda contra a stack do compose
// (auth-service + mongo + observabilidade). Não roda no `pnpm test`.
export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
    include: ['e2e/**/*.e2e.test.ts'],
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
})
