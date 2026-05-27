process.env.NODE_ENV = 'test'
process.env.LOG_LEVEL ??= 'silent'

process.env.MONGO_URL ??= 'mongodb://localhost:27019'
process.env.MONGO_DB_NAME ??= 'hr-ferias-test'

process.env.AUTH_JWKS_URL ??= 'http://auth.test/.well-known/jwks.json'
process.env.AUTH_JWT_ISSUER ??= 'https://auth.test'
process.env.AUTH_JWT_AUDIENCE ??= 'hr-core'

process.env.SWAGGER_ENABLED ??= 'false'
process.env.CORS_ORIGINS ??= ''

// Desliga os jobs em todo cenário de teste — eles são exercitados
// individualmente em `jobs/*.test.ts` chamando as funções diretamente.
process.env.JOBS_ENABLED ??= 'false'
