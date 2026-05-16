import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
    setupFiles: ['./test/setup.ts'],
    include: ['src/**/*.test.ts', 'src/**/*.spec.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json-summary'],
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.test.ts',
        'src/**/*.spec.ts',
        'src/server.ts',
        // tracing.ts é executado via `node --import` (side effect no top-level)
        // — só dá pra exercitar subindo o SDK inteiro em cada teste.
        'src/tracing.ts',
      ],
      thresholds: {
        // Atingido: ~99 lines / 100 functions / 86 branches / 99 statements.
        // Os branches que sobram são defensivos (no-orign sem CORS, '*' echo)
        // ou ramos de tooling (pino-pretty em dev).
        lines: 95,
        functions: 100,
        branches: 80,
        statements: 95,
      },
    },
  },
})
