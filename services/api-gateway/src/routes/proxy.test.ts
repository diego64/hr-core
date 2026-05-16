import type { FastifyInstance, InjectOptions, LightMyRequestResponse } from 'fastify'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { startJwksServer, type JwksServer } from '../../test/jwks.js'
import { startUpstream, type UpstreamServer } from '../../test/upstream.js'

describe('proxy routes', () => {
  let jwks: JwksServer
  let funcionarios: UpstreamServer
  let ferias: UpstreamServer
  let app: FastifyInstance

  beforeAll(async () => {
    jwks = await startJwksServer({ issuer: 'https://auth.test', audience: 'hr-core' })
    funcionarios = await startUpstream()
    ferias = await startUpstream()
    vi.stubEnv('AUTH_JWKS_URL', jwks.url)
    vi.stubEnv('FUNCIONARIO_SERVICE_URL', funcionarios.url)
    vi.stubEnv('FERIAS_SERVICE_URL', ferias.url)
    vi.stubEnv('AVALIACAO_SERVICE_URL', '')
    vi.stubEnv('FOLHA_PAGAMENTO_SERVICE_URL', '')
    vi.stubEnv('SWAGGER_ENABLED', 'false')
  })

  beforeEach(async () => {
    vi.resetModules()
    const mod = await import('../app.js')
    app = await mod.buildApp()
    await app.ready()
    funcionarios.requests.length = 0
    ferias.requests.length = 0
  })

  afterEach(async () => {
    await app.close()
  })

  afterAll(async () => {
    await jwks.stop()
    await funcionarios.stop()
    await ferias.stop()
    vi.unstubAllEnvs()
  })

  async function authedRequest(
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
    url: string,
    body?: unknown,
  ): Promise<LightMyRequestResponse> {
    const token = await jwks.sign({ sub: 'user-1', roles: ['admin'] })
    const opts: InjectOptions = {
      method,
      url,
      headers: { authorization: `Bearer ${token}` },
    }
    if (body !== undefined) {
      opts.payload = body as NonNullable<InjectOptions['payload']>
    }
    return await app.inject(opts)
  }

  it('reescreve /api/v1/funcionarios/{id} → /funcionarios/{id} no upstream', async () => {
    const res = await authedRequest('GET', '/api/v1/funcionarios/abc-123')
    expect(res.statusCode).toBe(200)
    expect(funcionarios.requests).toHaveLength(1)
    expect(funcionarios.requests[0]!.url).toBe('/funcionarios/abc-123')
  })

  it('reescreve /api/v1/ferias → /ferias no upstream correto', async () => {
    const res = await authedRequest('POST', '/api/v1/ferias', { dataInicio: '2026-01-01' })
    expect(res.statusCode).toBe(200)
    expect(ferias.requests).toHaveLength(1)
    expect(ferias.requests[0]!.url).toBe('/ferias')
    expect(funcionarios.requests).toHaveLength(0)
  })

  it('propaga x-trace-id (gera UUID quando cliente não envia)', async () => {
    await authedRequest('GET', '/api/v1/funcionarios/x')
    const traceId = funcionarios.requests[0]!.headers['x-trace-id']
    expect(typeof traceId).toBe('string')
    expect((traceId as string).length).toBeGreaterThan(10)
  })

  it('reusa x-trace-id quando cliente envia', async () => {
    const traceId = 'cccccccc-cccc-cccc-cccc-cccccccccccc'
    const token = await jwks.sign({ sub: 'u', roles: [] })
    await app.inject({
      method: 'GET',
      url: '/api/v1/funcionarios/x',
      headers: { authorization: `Bearer ${token}`, 'x-trace-id': traceId },
    })
    expect(funcionarios.requests[0]!.headers['x-trace-id']).toBe(traceId)
  })

  it('propaga x-user-id e x-user-roles a partir do JWT', async () => {
    const token = await jwks.sign({ sub: 'user-xyz', roles: ['hr', 'admin'] })
    await app.inject({
      method: 'GET',
      url: '/api/v1/funcionarios/x',
      headers: { authorization: `Bearer ${token}` },
    })
    const headers = funcionarios.requests[0]!.headers
    expect(headers['x-user-id']).toBe('user-xyz')
    expect(headers['x-user-roles']).toBe('hr,admin')
  })

  it('não registra rotas para serviços com env vazio (avaliacoes, folha)', async () => {
    const token = await jwks.sign({ sub: 'u', roles: [] })
    const headers = { authorization: `Bearer ${token}` }
    const res1 = await app.inject({ method: 'GET', url: '/api/v1/avaliacoes/x', headers })
    const res2 = await app.inject({ method: 'GET', url: '/api/v1/folha-de-pagamento/x', headers })
    expect(res1.statusCode).toBe(404)
    expect(res2.statusCode).toBe(404)
  })

  it('rejeita request sem Bearer antes de chegar no upstream', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/funcionarios/x' })
    expect(res.statusCode).toBe(401)
    expect(funcionarios.requests).toHaveLength(0)
  })

  it('envia o body do POST adiante para o upstream', async () => {
    const payload = { nome: 'João', email: 'joao@x.com' }
    await authedRequest('POST', '/api/v1/funcionarios', payload)
    const got = funcionarios.requests[0]!
    expect(got.method).toBe('POST')
    expect(JSON.parse(got.body)).toEqual(payload)
  })
})
