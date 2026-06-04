import { z } from 'zod'

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  HOST: z.string().min(1).default('0.0.0.0'),
  PORT: z.coerce.number().int().positive().default(3002),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),

  MONGO_URL: z.string().min(1),
  MONGO_DB_NAME: z.string().min(1).default('hr-funcionarios'),

  AUTH_JWKS_URL: z.url(),
  AUTH_JWT_ISSUER: z.string().min(1),
  AUTH_JWT_AUDIENCE: z.string().min(1),

  SWAGGER_ENABLED: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),
  SWAGGER_ROUTE_PREFIX: z.string().min(1).default('/docs'),

  CORS_ORIGINS: z.string().default(''),
  CORS_CREDENTIALS: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  CORS_MAX_AGE: z.coerce.number().int().nonnegative().default(86_400),

  OTEL_ENABLED: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  OTEL_SERVICE_NAME: z.string().min(1).default('funcionario'),
  OTEL_EXPORTER_OTLP_ENDPOINT: z.url().optional(),

  // Object storage (MinIO em dev, S3 em prod). S3_PUBLIC_ENDPOINT é separado
  // porque a URL assinada precisa ser alcançável pelo cliente HTTP final
  // (browser/Postman) — quando rodando em Docker, o serviço fala com
  // `minio:9000` internamente, mas o presigned URL precisa apontar pra
  // `http://localhost:9100` (alcançável do host).
  S3_ENDPOINT: z.url(),
  S3_PUBLIC_ENDPOINT: z.url().optional(),
  S3_REGION: z.string().min(1).default('us-east-1'),
  S3_ACCESS_KEY: z.string().min(1),
  S3_SECRET_KEY: z.string().min(1),
  S3_BUCKET: z.string().min(1).default('hr-funcionario-documentos'),
  S3_FORCE_PATH_STYLE: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),
  S3_PRESIGN_EXPIRES_SECONDS: z.coerce.number().int().positive().max(3600).default(900),

  // Kafka — quando KAFKA_ENABLED=false o service usa LogEventPublisher e
  // não publica eventos no broker.
  KAFKA_ENABLED: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  KAFKA_BROKERS: z.string().default('host.docker.internal:19092'),
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
