/**
 * Suite E2E — espelha o smoke manual via curl. Roda contra a stack do
 * compose:
 *   - auth-service em http://localhost:4000 (override via AUTH_BASE_URL)
 *   - mongo em mongodb://localhost:27017 (banco hr-auth do seed)
 *
 * Não usa app.inject — fala HTTP de verdade. Por isso valida o pipeline
 * completo: rede, TLS (quando aplicável), serialização Fastify, ingress
 * interno do compose.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const BASE = process.env.AUTH_BASE_URL ?? 'http://localhost:4000'

interface TokenPair {
  user: { id: string; email: string; roles: string[] }
  accessToken: string
  refreshToken: string
  accessTokenExpiresAt: string
  refreshTokenExpiresAt: string
}

async function http(method: string, path: string, body?: unknown, traceId?: string) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (traceId) headers['X-Trace-Id'] = traceId
  const res = await fetch(BASE + path, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : null,
  })
  const text = await res.text()
  let json: unknown
  try {
    json = text ? JSON.parse(text) : null
  } catch {
    json = null
  }
  return { status: res.status, headers: res.headers, body: json, raw: text }
}

const unique = () => `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@hr-core.local`

describe('Auth E2E (contra compose)', () => {
  beforeAll(async () => {
    // sanity — falha cedo se o serviço não está acessível
    const h = await http('GET', '/health')
    if (h.status !== 200) {
      throw new Error(`auth-service não está respondendo em ${BASE}/health (status=${h.status})`)
    }
  })

  afterAll(async () => {
    // sem cleanup — o banco hr-auth do compose pode reter usuários e@..
    // criados pela suite. Cada teste usa email único pra evitar colisão.
  })

  describe('público', () => {
    it('GET /health → 200', async () => {
      const r = await http('GET', '/health')
      expect(r.status).toBe(200)
      const b = r.body as { status: string; service: string; timestamp: string }
      expect(b.status).toBe('ok')
      expect(b.service).toBe('auth')
    })

    it('GET /ready → 200', async () => {
      const r = await http('GET', '/ready')
      expect(r.status).toBe(200)
    })

    it('GET /.well-known/jwks.json → 1 chave RSA RS256 com kid e use=sig', async () => {
      const r = await http('GET', '/.well-known/jwks.json')
      expect(r.status).toBe(200)
      const b = r.body as { keys: Array<Record<string, unknown>> }
      expect(b.keys).toHaveLength(1)
      expect(b.keys[0]!.kty).toBe('RSA')
      expect(b.keys[0]!.alg).toBe('RS256')
      expect(b.keys[0]!.use).toBe('sig')
      expect(typeof b.keys[0]!.kid).toBe('string')
    })

    it('GET /metrics → text/plain com http_request_duration_seconds_count', async () => {
      // gera 1 request prévia pra garantir contador
      await http('GET', '/health')
      const r = await http('GET', '/metrics')
      expect(r.status).toBe(200)
      expect(r.headers.get('content-type')).toContain('text/plain')
      expect(r.raw).toContain('http_request_duration_seconds_count')
    })
  })

  describe('register + login + refresh + logout', () => {
    const email = unique()
    const password = 'super-secret-12345'
    let tokens: TokenPair

    it('POST /auth/register → 201 + token pair (USUARIO default)', async () => {
      const r = await http('POST', '/auth/register', { email, password })
      expect(r.status).toBe(201)
      tokens = r.body as TokenPair
      expect(tokens.user.email).toBe(email)
      expect(tokens.user.roles).toEqual(['USUARIO'])
    })

    it('POST /auth/register (mesmo email) → 409 email-already-taken', async () => {
      const r = await http('POST', '/auth/register', { email, password })
      expect(r.status).toBe(409)
      const b = r.body as { type: string }
      expect(b.type).toContain('email-already-taken')
    })

    it('POST /auth/login (senha correta) → 200 + novo par', async () => {
      const r = await http('POST', '/auth/login', { email, password })
      expect(r.status).toBe(200)
      tokens = r.body as TokenPair
      expect(tokens.accessToken).toBeTruthy()
      expect(tokens.refreshToken).toBeTruthy()
    })

    it('POST /auth/login (senha errada) → 401 invalid-credentials', async () => {
      const r = await http('POST', '/auth/login', { email, password: 'definitivamente-errada' })
      expect(r.status).toBe(401)
      const b = r.body as { type: string }
      expect(b.type).toContain('invalid-credentials')
    })

    it('POST /auth/login (email inexistente) → 401 invalid-credentials (anti-enumeração)', async () => {
      const r = await http('POST', '/auth/login', {
        email: 'nao-existe-e2e@x.com',
        password: 'qualquer-senha-12345',
      })
      expect(r.status).toBe(401)
      const b = r.body as { type: string }
      expect(b.type).toContain('invalid-credentials')
    })

    it('POST /auth/refresh → 200 com refresh diferente do anterior', async () => {
      const old = tokens.refreshToken
      const r = await http('POST', '/auth/refresh', { refreshToken: old })
      expect(r.status).toBe(200)
      const newPair = r.body as TokenPair
      expect(newPair.refreshToken).not.toBe(old)
      tokens = newPair
    })

    it('POST /auth/refresh com token JÁ usado → 401 refresh-token-reuse-detected', async () => {
      // refresh deste ciclo: faz um refresh de novo, captura o anterior,
      // e tenta usar o anterior 1x mais
      const r1 = await http('POST', '/auth/refresh', { refreshToken: tokens.refreshToken })
      expect(r1.status).toBe(200)
      const consumed = tokens.refreshToken
      tokens = r1.body as TokenPair

      // reapresenta o token consumido
      const r2 = await http('POST', '/auth/refresh', { refreshToken: consumed })
      expect(r2.status).toBe(401)
      const b = r2.body as { type: string }
      expect(b.type).toContain('refresh-token-reuse-detected')
    })

    it('POST /auth/logout (idempotente) → 204', async () => {
      // depois do reuse, todos foram revogados em cascata; logout dum
      // refresh inválido deve retornar 204 (não vaza estado)
      const r = await http('POST', '/auth/logout', { refreshToken: tokens.refreshToken })
      expect(r.status).toBe(204)
    })
  })

  describe('validação Zod', () => {
    it('POST /auth/login com payload inválido → 400 RFC 7807', async () => {
      const r = await http('POST', '/auth/login', { email: 'nao-eh-email', password: 'x' })
      expect(r.status).toBe(400)
      expect(r.headers.get('content-type')).toContain('application/problem+json')
    })
  })

  describe('traceId propagation', () => {
    it('honra X-Trace-Id do cliente em respostas de erro', async () => {
      const traceId = '7d7d7d7d-7d7d-7d7d-7d7d-7d7d7d7d7d7d'
      const r = await http('GET', '/rota-inexistente', undefined, traceId)
      expect(r.status).toBe(404)
      const b = r.body as { traceId: string }
      expect(b.traceId).toBe(traceId)
    })
  })
})
