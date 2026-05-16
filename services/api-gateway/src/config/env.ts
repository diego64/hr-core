import { z } from 'zod'

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  HOST: z.string().min(1).default('0.0.0.0'),
  PORT: z.coerce.number().int().positive().default(3000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),

  AUTH_JWKS_URL: z.url(),
  AUTH_JWT_ISSUER: z.string().min(1),
  AUTH_JWT_AUDIENCE: z.string().min(1),

  OTEL_ENABLED: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  OTEL_SERVICE_NAME: z.string().min(1).default('api-gateway'),
  OTEL_EXPORTER_OTLP_ENDPOINT: z.url().optional(),
  OTEL_RESOURCE_ATTRIBUTES: z.string().optional(),

  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(100),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60_000),

  CORS_ORIGINS: z.string().default(''),
  CORS_CREDENTIALS: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  CORS_MAX_AGE: z.coerce.number().int().nonnegative().default(86_400),

  SWAGGER_ENABLED: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),
  SWAGGER_ROUTE_PREFIX: z.string().min(1).default('/docs'),

  FUNCIONARIO_SERVICE_URL: z.url(),
  // Envs opcionais — string vazia é tratada como ausente (z.url() não aceita "").
  FERIAS_SERVICE_URL: z.preprocess((v) => (v === '' ? undefined : v), z.url().optional()),
  AVALIACAO_SERVICE_URL: z.preprocess((v) => (v === '' ? undefined : v), z.url().optional()),
  FOLHA_PAGAMENTO_SERVICE_URL: z.preprocess((v) => (v === '' ? undefined : v), z.url().optional()),
})

export type Env = z.infer<typeof envSchema>

const parsed = envSchema.safeParse(process.env)

if (!parsed.success) {
  const flat = z.flattenError(parsed.error)
  const formatted = Object.entries(flat.fieldErrors)
    .map(([key, msgs]) => `  - ${key}: ${(msgs ?? []).join(', ')}`)
    .join('\n')
  throw new Error(`Invalid environment configuration:\n${formatted}`)
}

export const env: Env = parsed.data
