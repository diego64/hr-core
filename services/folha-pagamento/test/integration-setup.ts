// Ambiente mínimo para integration + e2e tests. Cada suite faz override
// de AUTH_JWKS_URL antes de chamar buildApp() (via jwt-harness) e usa
// o MONGO_URL do testcontainer da própria suite.
process.env.NODE_ENV = 'test'
process.env.LOG_LEVEL ??= 'silent'

// MONGO_URL será sobrescrita por cada suite com o URI do testcontainer.
// Esse default só existe para o env-schema do Zod aceitar o boot inicial.
process.env.MONGO_URL ??= 'mongodb://placeholder:27017'
process.env.MONGO_DB_NAME ??= 'hr-folha-test'

// AUTH_JWKS_URL idem — substituído por suite antes de buildApp().
process.env.AUTH_JWKS_URL ??= 'http://placeholder/.well-known/jwks.json'
process.env.AUTH_JWT_ISSUER ??= 'https://auth.test'
process.env.AUTH_JWT_AUDIENCE ??= 'hr-core'

process.env.SWAGGER_ENABLED ??= 'false'
process.env.CORS_ORIGINS ??= ''
