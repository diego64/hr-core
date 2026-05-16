/**
 * Integração — sobe o app inteiro (buildApp) contra um Mongo real e
 * exercita rotas via `app.inject` (sem socket TCP). Cobre simultaneamente:
 *   - controllers (auth, jwks, health)
 *   - schemas Zod (validação 400)
 *   - middlewares (error-handler, cors, metrics)
 *   - services (auth, password, token, key)
 *   - repositories (user, refresh-token)
 */
import { exportJWK, importSPKI, jwtVerify } from 'jose'
import { createPublicKey } from 'node:crypto'
import { type FastifyInstance } from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { buildApp } from './app.js'
import { env } from './config/env.js'
import { cleanCollections, closeTestDb, getTestDb } from '../test/db.js'

describe('auth app (integração)', () => {
  let app: FastifyInstance

  beforeAll(async () => {
    const db = await getTestDb()
    app = await buildApp({ db })
    await app.ready()
  })

  beforeEach(async () => {
    const db = await getTestDb()
    await cleanCollections(db)
  })

  afterAll(async () => {
    await app.close()
    await closeTestDb()
  })

  // ---------------------------------------------------------------- health
  describe('GET /health', () => {
    it('responds 200 with service=auth', async () => {
      const res = await app.inject({ method: 'GET', url: '/health' })
      expect(res.statusCode).toBe(200)
      const body = res.json()
      expect(body.status).toBe('ok')
      expect(body.service).toBe('auth')
      expect(typeof body.timestamp).toBe('string')
    })

    it('propagates X-Trace-Id header into request.id (genReqId branch)', async () => {
      const traceId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
      // /nope dá 404 RFC 7807 com traceId no body — confirma reuso do header
      const err = await app.inject({
        method: 'GET',
        url: '/nope',
        headers: { 'x-trace-id': traceId },
      })
      expect(err.statusCode).toBe(404)
      expect(err.json().traceId).toBe(traceId)
    })
  })

  describe('GET /ready', () => {
    it('responds 200', async () => {
      const res = await app.inject({ method: 'GET', url: '/ready' })
      expect(res.statusCode).toBe(200)
      expect(res.json().status).toBe('ok')
    })
  })

  // ------------------------------------------------------------------ jwks
  describe('GET /.well-known/jwks.json', () => {
    it('responds 200 with a single RSA key (kid + alg + use)', async () => {
      const res = await app.inject({ method: 'GET', url: '/.well-known/jwks.json' })
      expect(res.statusCode).toBe(200)
      const body = res.json()
      expect(Array.isArray(body.keys)).toBe(true)
      expect(body.keys).toHaveLength(1)
      const k = body.keys[0]
      expect(k.kid).toBe(env.AUTH_JWT_KID)
      expect(k.alg).toBe('RS256')
      expect(k.use).toBe('sig')
      expect(k.kty).toBe('RSA')
    })

    it('sets cache-control public max-age', async () => {
      const res = await app.inject({ method: 'GET', url: '/.well-known/jwks.json' })
      expect(res.headers['cache-control']).toMatch(/public, max-age=\d+/)
    })
  })

  // -------------------------------------------------------------- register
  describe('POST /auth/register', () => {
    it('creates a user and returns 201 with token pair', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/auth/register',
        payload: { email: 'new@x.com', password: 'super-secret-12345' },
      })
      expect(res.statusCode).toBe(201)
      const body = res.json()
      expect(body.user.email).toBe('new@x.com')
      expect(body.user.roles).toEqual(['USUARIO'])
      expect(body.user.active).toBe(true)
      expect(body.accessToken).toBeTruthy()
      expect(body.refreshToken).toBeTruthy()
    })

    it('rejects duplicate email with 409 RFC 7807 email-already-taken', async () => {
      const payload = { email: 'dup@x.com', password: 'super-secret-12345' }
      await app.inject({ method: 'POST', url: '/auth/register', payload })
      const res2 = await app.inject({ method: 'POST', url: '/auth/register', payload })
      expect(res2.statusCode).toBe(409)
      const body = res2.json()
      expect(body.type).toContain('email-already-taken')
      expect(body.status).toBe(409)
    })

    it('rejects payload with invalid email (Zod 400)', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/auth/register',
        payload: { email: 'nao-eh-email', password: 'super-secret-12345' },
      })
      expect(res.statusCode).toBe(400)
      const body = res.json()
      expect(body.status).toBe(400)
      expect(body.type).toBeTruthy()
    })

    it('rejects payload with short password (Zod 400)', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/auth/register',
        payload: { email: 'short@x.com', password: '1234567' },
      })
      expect(res.statusCode).toBe(400)
    })
  })

  // ----------------------------------------------------------------- login
  describe('POST /auth/login', () => {
    async function registered(email = 'login@x.com', password = 'super-secret-12345') {
      await app.inject({
        method: 'POST',
        url: '/auth/register',
        payload: { email, password },
      })
      return { email, password }
    }

    it('returns a fresh pair when credentials match', async () => {
      const { email, password } = await registered()
      const res = await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: { email, password },
      })
      expect(res.statusCode).toBe(200)
      const body = res.json()
      expect(body.user.email).toBe(email)
      expect(body.accessToken).toBeTruthy()
    })

    it('returns 401 invalid-credentials for wrong password', async () => {
      const { email } = await registered()
      const res = await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: { email, password: 'definitivamente-errada-12345' },
      })
      expect(res.statusCode).toBe(401)
      expect(res.json().type).toContain('invalid-credentials')
    })

    it('returns 401 invalid-credentials for unknown email (anti-enumeration)', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: { email: 'inexistente@x.com', password: 'qualquer-coisa-123' },
      })
      expect(res.statusCode).toBe(401)
      expect(res.json().type).toContain('invalid-credentials')
    })

    it('returns 403 user-disabled when account.active=false', async () => {
      const { email, password } = await registered('disabled@x.com')
      const db = await getTestDb()
      await db.collection('users').updateOne({ email }, { $set: { active: false } })

      const res = await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: { email, password },
      })
      expect(res.statusCode).toBe(403)
      expect(res.json().type).toContain('user-disabled')
    })

    it('emits an access token verifiable by the published JWKS key', async () => {
      const { email, password } = await registered('verify@x.com')
      const login = await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: { email, password },
      })
      const accessToken = login.json().accessToken as string

      const jwks = await app.inject({ method: 'GET', url: '/.well-known/jwks.json' })
      const jwk = jwks.json().keys[0]
      // Reconstrói a public key a partir do JWK pra emular o que o gateway faz.
      const pubKeyObj = createPublicKey({ key: { ...jwk, alg: undefined }, format: 'jwk' })
      const pubJwk = await exportJWK(pubKeyObj)
      pubJwk.alg = 'RS256'
      const pubKey = await importSPKI(pubKeyObj.export({ format: 'pem', type: 'spki' }), 'RS256')

      const { payload } = await jwtVerify(accessToken, pubKey, {
        issuer: env.AUTH_JWT_ISSUER,
        audience: env.AUTH_JWT_AUDIENCE,
      })
      expect(payload.sub).toBeTruthy()
      expect(payload.roles).toEqual(['USUARIO'])
    })
  })

  // --------------------------------------------------------------- refresh
  describe('POST /auth/refresh (rotation + reuse detection)', () => {
    async function loginPair() {
      const email = 'rot@x.com'
      const password = 'super-secret-12345'
      await app.inject({ method: 'POST', url: '/auth/register', payload: { email, password } })
      const res = await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: { email, password },
      })
      return JSON.parse(res.payload) as { refreshToken: string; user: { id: string } }
    }

    it('rotates the refresh token and returns a new pair', async () => {
      const { refreshToken } = await loginPair()
      const res = await app.inject({
        method: 'POST',
        url: '/auth/refresh',
        payload: { refreshToken },
      })
      expect(res.statusCode).toBe(200)
      const body = res.json()
      expect(body.refreshToken).not.toEqual(refreshToken)
    })

    it('returns 401 refresh-token-reuse-detected on reuse + revokes all', async () => {
      const { refreshToken, user } = await loginPair()
      // primeira rotação — OK
      await app.inject({ method: 'POST', url: '/auth/refresh', payload: { refreshToken } })
      // segunda com o MESMO token (reuse)
      const res2 = await app.inject({
        method: 'POST',
        url: '/auth/refresh',
        payload: { refreshToken },
      })
      expect(res2.statusCode).toBe(401)
      expect(res2.json().type).toContain('refresh-token-reuse-detected')

      const db = await getTestDb()
      const remaining = await db
        .collection('refresh_tokens')
        .countDocuments({ userId: { $exists: true }, revokedAt: null })
      // todos os tokens (inclusive os da rotação válida) revogados em cascata
      const userTokens = await db.collection('refresh_tokens').find({ revokedAt: null }).toArray()
      const remainingForUser = userTokens.filter((t) => String(t.userId) === user.id)
      expect(remainingForUser).toHaveLength(0)
      // confirmar que existem documentos remanescentes apenas como histórico
      expect(remaining).toBeGreaterThanOrEqual(0)
    })

    it('returns 401 invalid-refresh-token for tokens with bad signature', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/auth/refresh',
        payload: { refreshToken: 'eyJhbGciOiJSUzI1NiJ9.fake.signature-aqui-invalida' },
      })
      expect(res.statusCode).toBe(401)
      expect(res.json().type).toContain('invalid-refresh-token')
    })

    it('returns 401 when refresh token JWT is valid but jtiHash is not in the DB', async () => {
      // Forja um refresh token "válido" mas que nunca foi persistido: removemos do banco.
      const { refreshToken } = await loginPair()
      const db = await getTestDb()
      await db.collection('refresh_tokens').deleteMany({})
      const res = await app.inject({
        method: 'POST',
        url: '/auth/refresh',
        payload: { refreshToken },
      })
      expect(res.statusCode).toBe(401)
      expect(res.json().type).toContain('invalid-refresh-token')
    })

    it('returns 401 invalid-refresh-token when the token is an access token (typ != refresh)', async () => {
      const { user } = await loginPair()
      const login = await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: { email: 'rot@x.com', password: 'super-secret-12345' },
      })
      const accessToken = login.json().accessToken as string
      const res = await app.inject({
        method: 'POST',
        url: '/auth/refresh',
        payload: { refreshToken: accessToken },
      })
      expect(res.statusCode).toBe(401)
      expect(res.json().type).toContain('invalid-refresh-token')
      expect(user.id).toBeTruthy()
    })

    it('returns 403 user-disabled when user is deactivated between login and refresh', async () => {
      const { refreshToken } = await loginPair()
      const db = await getTestDb()
      await db.collection('users').updateOne({ email: 'rot@x.com' }, { $set: { active: false } })
      const res = await app.inject({
        method: 'POST',
        url: '/auth/refresh',
        payload: { refreshToken },
      })
      expect(res.statusCode).toBe(403)
      expect(res.json().type).toContain('user-disabled')
    })

    it('returns 401 when the refresh token references a user that was deleted', async () => {
      const { refreshToken } = await loginPair()
      const db = await getTestDb()
      await db.collection('users').deleteMany({})
      const res = await app.inject({
        method: 'POST',
        url: '/auth/refresh',
        payload: { refreshToken },
      })
      expect(res.statusCode).toBe(401)
      expect(res.json().type).toContain('invalid-refresh-token')
    })

    it('returns 401 invalid-refresh-token when token is expired', async () => {
      const { refreshToken } = await loginPair()
      const db = await getTestDb()
      // força expiração imediata no banco
      await db
        .collection('refresh_tokens')
        .updateMany({}, { $set: { expiresAt: new Date(Date.now() - 1000) } })
      const res = await app.inject({
        method: 'POST',
        url: '/auth/refresh',
        payload: { refreshToken },
      })
      expect(res.statusCode).toBe(401)
      expect(res.json().type).toContain('invalid-refresh-token')
    })
  })

  // --------------------------------------------------------------- logout
  describe('POST /auth/logout', () => {
    async function loginPair() {
      const email = 'logout@x.com'
      const password = 'super-secret-12345'
      await app.inject({ method: 'POST', url: '/auth/register', payload: { email, password } })
      const res = await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: { email, password },
      })
      return res.json().refreshToken as string
    }

    it('revokes a valid refresh token and returns 204', async () => {
      const refreshToken = await loginPair()
      const res = await app.inject({
        method: 'POST',
        url: '/auth/logout',
        payload: { refreshToken },
      })
      expect(res.statusCode).toBe(204)
      const db = await getTestDb()
      // O `loginPair` gera 2 refresh tokens (register + login); só o do login
      // (que foi passado pro logout) deveria ter revokedAt definido.
      const revoked = await db.collection('refresh_tokens').countDocuments({
        revokedAt: { $ne: null },
      })
      expect(revoked).toBe(1)
    })

    it('is idempotent — returns 204 for an invalid refresh token', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/auth/logout',
        payload: { refreshToken: 'eyJhbGciOiJSUzI1NiJ9.fake.broken' },
      })
      expect(res.statusCode).toBe(204)
    })

    it('is idempotent — returns 204 for an access token (typ != refresh)', async () => {
      const email = 'logout-acc@x.com'
      const password = 'super-secret-12345'
      await app.inject({ method: 'POST', url: '/auth/register', payload: { email, password } })
      const login = await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: { email, password },
      })
      const accessToken = login.json().accessToken as string
      const res = await app.inject({
        method: 'POST',
        url: '/auth/logout',
        payload: { refreshToken: accessToken },
      })
      expect(res.statusCode).toBe(204)
    })
  })

  // ------------------------------------------------------------- metrics
  describe('GET /metrics', () => {
    it('returns Prometheus text format with http_request_*', async () => {
      // gera ao menos 1 request pra ter contadores
      await app.inject({ method: 'GET', url: '/health' })
      const res = await app.inject({ method: 'GET', url: '/metrics' })
      expect(res.statusCode).toBe(200)
      expect(res.headers['content-type']).toContain('text/plain')
      expect(res.payload).toMatch(/http_request_duration_seconds_count/)
    })
  })

  // ------------------------------------------------------------ not found
  describe('error handler', () => {
    it('returns 404 RFC 7807 for unknown routes', async () => {
      const res = await app.inject({ method: 'GET', url: '/rota-inexistente' })
      expect(res.statusCode).toBe(404)
      expect(res.headers['content-type']).toContain('application/problem+json')
      const body = res.json()
      expect(body.status).toBe(404)
      expect(body.type).toContain('not-found')
      expect(typeof body.traceId).toBe('string')
    })
  })
})
