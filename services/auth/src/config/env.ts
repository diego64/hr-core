import { z } from 'zod'

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  HOST: z.string().min(1).default('0.0.0.0'),
  PORT: z.coerce.number().int().positive().default(4000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),

  MONGO_URL: z.string().min(1),
  MONGO_DB_NAME: z.string().min(1).default('hr-auth'),

  AUTH_JWT_ISSUER: z.string().min(1),
  AUTH_JWT_AUDIENCE: z.string().min(1),
  AUTH_JWT_KID: z.string().min(1).default('auth-v1'),
  AUTH_PRIVATE_KEY_PATH: z.string().optional(),

  AUTH_ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(900),
  AUTH_REFRESH_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(604_800),

  AUTH_SCRYPT_LOG_N: z.coerce.number().int().min(10).max(20).default(15),
  AUTH_SCRYPT_R: z.coerce.number().int().min(1).max(32).default(8),
  AUTH_SCRYPT_P: z.coerce.number().int().min(1).max(16).default(1),

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

  OTEL_ENABLED: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  OTEL_SERVICE_NAME: z.string().min(1).default('auth'),
  OTEL_EXPORTER_OTLP_ENDPOINT: z.url().optional(),
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
