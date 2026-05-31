import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
    setupFiles: ['./test/setup.ts'],
    include: ['src/**/*.test.ts', 'src/**/*.spec.ts'],
    exclude: ['**/node_modules/**', '**/dist/**', '**/*.integration.test.ts'],
    fileParallelism: false,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json-summary'],
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.test.ts',
        'src/**/*.spec.ts',
        'src/**/*.integration.test.ts',
        'src/server.ts',
        'src/tracing.ts',
        // Apenas tipos/constantes — sem runtime para cobrir
        'src/modules/domain/entities/auditoria.ts',
        // Stub do Kafka; será substituído por KafkaEventPublisher quando o
        // broker entrar — testes usam InMemoryEventPublisher.
        'src/infrastructure/messaging/event-publisher.ts',
      ],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 75,
        statements: 80,
      },
    },
  },
})
