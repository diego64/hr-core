process.env.NODE_ENV = 'test'
process.env.LOG_LEVEL ??= 'silent'

process.env.MONGO_URL ??= 'mongodb://localhost:27017'
process.env.MONGO_DB_NAME ??= 'hr-auth-test'

process.env.AUTH_JWT_ISSUER ??= 'https://auth.test'
process.env.AUTH_JWT_AUDIENCE ??= 'hr-core'
process.env.AUTH_JWT_KID ??= 'auth-test'
process.env.AUTH_ACCESS_TOKEN_TTL_SECONDS ??= '900'
process.env.AUTH_REFRESH_TOKEN_TTL_SECONDS ??= '604800'

// scrypt mais rápido para evitar lentidão dos testes (log_n=10 ≈ 1KB de memória).
// Em produção, AUTH_SCRYPT_LOG_N=15 é o default seguro.
process.env.AUTH_SCRYPT_LOG_N ??= '10'
process.env.AUTH_SCRYPT_R ??= '8'
process.env.AUTH_SCRYPT_P ??= '1'

process.env.CORS_ORIGINS ??= ''
