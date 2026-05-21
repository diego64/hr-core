process.env.NODE_ENV = 'test'
process.env.LOG_LEVEL ??= 'silent'

process.env.MONGO_URL ??= 'mongodb://localhost:27018'
process.env.MONGO_DB_NAME ??= 'hr-funcionarios-test'

process.env.AUTH_JWKS_URL ??= 'http://auth.test/.well-known/jwks.json'
process.env.AUTH_JWT_ISSUER ??= 'https://auth.test'
process.env.AUTH_JWT_AUDIENCE ??= 'hr-core'

process.env.SWAGGER_ENABLED ??= 'false'
process.env.CORS_ORIGINS ??= ''

// Storage (MinIO em dev, S3 em prod). Em tests a maioria das suítes mocka
// a camada de storage; estes defaults só existem para o parser de env não
// quebrar no import.
process.env.S3_ENDPOINT ??= 'http://localhost:9100'
process.env.S3_ACCESS_KEY ??= 'test-key'
process.env.S3_SECRET_KEY ??= 'test-secret'
process.env.S3_BUCKET ??= 'hr-funcionario-documentos-test'
