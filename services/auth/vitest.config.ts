import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
    setupFiles: ['./test/setup.ts'],
    include: ['src/**/*.test.ts', 'src/**/*.spec.ts'],
    // Os arquivos integrados (app.test.ts, repository.test.ts) compartilham
    // o banco hr-auth-test. Rodar em série evita race nos cleanCollections
    // entre arquivos.
    fileParallelism: false,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json-summary'],
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.test.ts',
        'src/**/*.spec.ts',
        'src/server.ts',
        // tracing.ts é executado via `node --import` (side effect no top-level)
        // e exporta apenas o shutdownTracing — não dá pra exercitar sem subir
        // o SDK inteiro em cada teste.
        'src/tracing.ts',
      ],
      thresholds: {
        // Atingido: 99 lines / 100 functions / 86 branches / 99 statements.
        // Os branches que sobram são defesa-em-profundidade (markUsed race,
        // derived.length scrypt impossível em prática, NODE_ENV='development'
        // que ativa pino-pretty) e exigem mocks complexos para cobrir.
        lines: 95,
        functions: 100,
        branches: 80,
        statements: 95,
      },
    },
  },
})
