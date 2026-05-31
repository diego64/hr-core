/**
 * Cobertura dos 3 modos do plugin CORS: desabilitado, wildcard e allowlist.
 * Cada modo recarrega o módulo via vi.resetModules() porque parseOrigins lê
 * env.CORS_ORIGINS no momento do register().
 */
import Fastify, { type FastifyInstance } from 'fastify'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

async function buildAppWithCors(): Promise<FastifyInstance> {
  vi.resetModules()
  const mod = await import('./cors.js')
  const app = Fastify({ logger: false })
  await app.register(mod.default)
  app.get('/echo', async () => ({ ok: true }))
  await app.ready()
  return app
}

describe('cors middleware', () => {
  let app: FastifyInstance

  beforeEach(() => {
    vi.unstubAllEnvs()
  })

  afterEach(async () => {
    if (app) await app.close()
    vi.unstubAllEnvs()
  })

  it('CORS_ORIGINS="" → não registra @fastify/cors, request sem header Origin passa', async () => {
    vi.stubEnv('CORS_ORIGINS', '')
    app = await buildAppWithCors()
    const res = await app.inject({
      method: 'OPTIONS',
      url: '/echo',
      headers: { origin: 'http://qualquer.com', 'access-control-request-method': 'GET' },
    })
    expect(res.headers['access-control-allow-origin']).toBeUndefined()
  })

  it('CORS_ORIGINS="*" → reflete origin recebida (@fastify/cors com origin=true reflete em vez de "*" literal)', async () => {
    vi.stubEnv('CORS_ORIGINS', '*')
    app = await buildAppWithCors()
    const res = await app.inject({
      method: 'OPTIONS',
      url: '/echo',
      headers: { origin: 'http://qualquer.com', 'access-control-request-method': 'GET' },
    })
    expect(res.headers['access-control-allow-origin']).toBe('http://qualquer.com')
  })

  it('CORS_ORIGINS="a.com,b.com" → origin na allowlist é refletido', async () => {
    vi.stubEnv('CORS_ORIGINS', 'http://a.com,http://b.com')
    app = await buildAppWithCors()
    const res = await app.inject({
      method: 'OPTIONS',
      url: '/echo',
      headers: { origin: 'http://a.com', 'access-control-request-method': 'GET' },
    })
    expect(res.headers['access-control-allow-origin']).toBe('http://a.com')
  })

  it('CORS_ORIGINS allowlist → origin fora da lista não é refletido', async () => {
    vi.stubEnv('CORS_ORIGINS', 'http://a.com,http://b.com')
    app = await buildAppWithCors()
    const res = await app.inject({
      method: 'OPTIONS',
      url: '/echo',
      headers: { origin: 'http://hostil.com', 'access-control-request-method': 'GET' },
    })
    expect(res.headers['access-control-allow-origin']).toBeUndefined()
  })

  it('CORS_ORIGINS allowlist → request SEM origin é tratada como permitida (cb(null, true))', async () => {
    vi.stubEnv('CORS_ORIGINS', 'http://a.com')
    app = await buildAppWithCors()
    const res = await app.inject({ method: 'GET', url: '/echo' })
    expect(res.statusCode).toBe(200)
  })

  it('CORS_ORIGINS=",,, " (só vazios) → cai para desabilitado', async () => {
    vi.stubEnv('CORS_ORIGINS', ',,, ')
    app = await buildAppWithCors()
    const res = await app.inject({
      method: 'OPTIONS',
      url: '/echo',
      headers: { origin: 'http://a.com', 'access-control-request-method': 'GET' },
    })
    expect(res.headers['access-control-allow-origin']).toBeUndefined()
  })
})
