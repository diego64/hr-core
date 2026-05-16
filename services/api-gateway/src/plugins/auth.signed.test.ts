/**
 * Testes do `auth` plugin com tokens reais — sobe um JWKS server local,
 * configura AUTH_JWKS_URL para ele e exercita os caminhos felizes/negativos
 * que dependem da verificação criptográfica do JWT.
 *
 * Os testes do `auth.test.ts` cobrem apenas os caminhos "sem token / mal
 * formado / token inválido". Aqui cobrimos:
 *   - token válido → request.user populado, proxy chamado
 *   - token expirado → 401 ERR_JWT_EXPIRED
 *   - issuer errado → 401
 *   - audience errado → 401
 *   - sub faltando → 401
 *   - roles não-array → roles vira []
 */
import type { FastifyInstance } from 'fastify'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { startJwksServer, type JwksServer } from '../../test/jwks.js'
import { startUpstream, type UpstreamServer } from '../../test/upstream.js'

describe('auth plugin (com tokens assinados)', () => {
  let jwks: JwksServer
  let upstream: UpstreamServer
  let app: FastifyInstance

  beforeAll(async () => {
    jwks = await startJwksServer({ issuer: 'https://auth.test', audience: 'hr-core' })
    upstream = await startUpstream()
    // env.ts já foi carregado pelo test/setup.ts — temos que recarregar
    // o módulo após mexer em process.env
    vi.stubEnv('AUTH_JWKS_URL', jwks.url)
    vi.stubEnv('FUNCIONARIO_SERVICE_URL', upstream.url)
    vi.stubEnv('SWAGGER_ENABLED', 'false') // não precisa de /docs aqui
  })

  beforeEach(async () => {
    vi.resetModules()
    const mod = await import('../app.js')
    app = await mod.buildApp()
    await app.ready()
  })

  afterEach(async () => {
    await app.close()
  })

  afterAll(async () => {
    await jwks.stop()
    await upstream.stop()
    vi.unstubAllEnvs()
  })

  it('aceita JWT válido — proxy é chamado e headers x-user-* são propagados', async () => {
    const token = await jwks.sign({ sub: 'user-42', roles: ['admin', 'hr'] })
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/funcionarios/123',
      headers: { authorization: `Bearer ${token}` },
    })
    expect(res.statusCode).toBe(200)

    expect(upstream.requests.length).toBeGreaterThan(0)
    const last = upstream.requests[upstream.requests.length - 1]!
    expect(last.headers['x-user-id']).toBe('user-42')
    expect(last.headers['x-user-roles']).toBe('admin,hr')
    expect(typeof last.headers['x-trace-id']).toBe('string')
    // path é reescrito: /api/v1/funcionarios/123 → /funcionarios/123
    expect(last.url).toMatch(/^\/funcionarios/)
  })

  it('rejeita JWT expirado → 401 com code ERR_JWT_EXPIRED no detail', async () => {
    const token = await jwks.sign(
      { sub: 'user-42', roles: ['admin'] },
      { expirationOffsetSeconds: -10 },
    )
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/funcionarios/123',
      headers: { authorization: `Bearer ${token}` },
    })
    expect(res.statusCode).toBe(401)
    expect(res.json().detail).toMatch(/EXPIRED|expired/i)
  })

  it('rejeita JWT com issuer errado → 401', async () => {
    const token = await jwks.sign(
      { sub: 'user-42', roles: ['admin'] },
      { issuer: 'https://outro.test' },
    )
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/funcionarios/123',
      headers: { authorization: `Bearer ${token}` },
    })
    expect(res.statusCode).toBe(401)
  })

  it('rejeita JWT com audience errado → 401', async () => {
    const token = await jwks.sign({ sub: 'user-42', roles: ['admin'] }, { audience: 'other-app' })
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/funcionarios/123',
      headers: { authorization: `Bearer ${token}` },
    })
    expect(res.statusCode).toBe(401)
  })

  it('rejeita JWT sem claim sub → 401', async () => {
    const token = await jwks.sign({ roles: ['admin'] })
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/funcionarios/123',
      headers: { authorization: `Bearer ${token}` },
    })
    expect(res.statusCode).toBe(401)
    expect(res.json().detail).toMatch(/sub/i)
  })

  it('quando roles não é array, considera roles=[] e propaga header vazio', async () => {
    const token = await jwks.sign({ sub: 'user-42', roles: 'admin-as-string' })
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/funcionarios/123',
      headers: { authorization: `Bearer ${token}` },
    })
    expect(res.statusCode).toBe(200)
    const last = upstream.requests[upstream.requests.length - 1]!
    expect(last.headers['x-user-roles']).toBe('')
  })

  it('quando roles tem entradas não-string, são filtradas', async () => {
    const token = await jwks.sign({ sub: 'user-42', roles: ['admin', 42, null, 'hr'] })
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/funcionarios/123',
      headers: { authorization: `Bearer ${token}` },
    })
    expect(res.statusCode).toBe(200)
    const last = upstream.requests[upstream.requests.length - 1]!
    expect(last.headers['x-user-roles']).toBe('admin,hr')
  })
})
