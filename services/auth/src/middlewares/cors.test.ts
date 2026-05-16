import Fastify, { type FastifyInstance } from 'fastify'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

describe('middlewares.cors', () => {
  let app: FastifyInstance | null = null

  beforeEach(() => {
    vi.resetModules()
  })

  afterEach(async () => {
    if (app) await app.close()
    app = null
    vi.unstubAllEnvs()
  })

  async function buildWithEnv(envOverrides: Record<string, string>): Promise<FastifyInstance> {
    for (const [k, v] of Object.entries(envOverrides)) vi.stubEnv(k, v)
    const corsPlugin = (await import('./cors.js')).default
    const fastify = Fastify({ logger: false })
    fastify.get('/x', async () => ({ ok: true }))
    await fastify.register(corsPlugin)
    await fastify.ready()
    return fastify
  }

  it('disables CORS when CORS_ORIGINS is empty (logs warning, no header)', async () => {
    app = await buildWithEnv({ CORS_ORIGINS: '' })
    const res = await app.inject({
      method: 'OPTIONS',
      url: '/x',
      headers: { origin: 'http://foo', 'access-control-request-method': 'GET' },
    })
    expect(res.headers['access-control-allow-origin']).toBeUndefined()
  })

  it('disables CORS when only whitespace/commas (parsing yields empty list)', async () => {
    app = await buildWithEnv({ CORS_ORIGINS: '  ,  ,' })
    const res = await app.inject({
      method: 'OPTIONS',
      url: '/x',
      headers: { origin: 'http://foo', 'access-control-request-method': 'GET' },
    })
    expect(res.headers['access-control-allow-origin']).toBeUndefined()
  })

  it('allows any origin when CORS_ORIGINS=* (echoes request Origin)', async () => {
    app = await buildWithEnv({ CORS_ORIGINS: '*' })
    const res = await app.inject({
      method: 'OPTIONS',
      url: '/x',
      headers: { origin: 'http://foo', 'access-control-request-method': 'GET' },
    })
    // Com origin=true no @fastify/cors, o header ecoa o Origin recebido
    expect(res.headers['access-control-allow-origin']).toBe('http://foo')
  })

  it('echoes allowed origin from allowlist', async () => {
    app = await buildWithEnv({ CORS_ORIGINS: 'http://allowed.test,http://outro.test' })
    const res = await app.inject({
      method: 'OPTIONS',
      url: '/x',
      headers: { origin: 'http://allowed.test', 'access-control-request-method': 'GET' },
    })
    expect(res.headers['access-control-allow-origin']).toBe('http://allowed.test')
  })

  it('rejects origin not in allowlist (no ACAO header)', async () => {
    app = await buildWithEnv({ CORS_ORIGINS: 'http://allowed.test' })
    const res = await app.inject({
      method: 'OPTIONS',
      url: '/x',
      headers: { origin: 'http://blocked.test', 'access-control-request-method': 'GET' },
    })
    expect(res.headers['access-control-allow-origin']).toBeUndefined()
  })

  it('handles requests with no Origin header (server-to-server)', async () => {
    app = await buildWithEnv({ CORS_ORIGINS: 'http://allowed.test' })
    const res = await app.inject({ method: 'GET', url: '/x' })
    expect(res.statusCode).toBe(200)
  })
})
