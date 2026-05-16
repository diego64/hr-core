/**
 * Suite complementar ao proxy.test.ts — testa o caminho onde TODOS os 4
 * microsserviços downstream estão configurados (cobre os branches `true`
 * de `if (env.AVALIACAO_SERVICE_URL)` e `if (env.FOLHA_PAGAMENTO_SERVICE_URL)`).
 */
import type { FastifyInstance } from 'fastify'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { startJwksServer, type JwksServer } from '../../test/jwks.js'
import { startUpstream, type UpstreamServer } from '../../test/upstream.js'

describe('proxy routes (todos os 4 prefixos configurados)', () => {
  let jwks: JwksServer
  let funcionarios: UpstreamServer
  let ferias: UpstreamServer
  let avaliacoes: UpstreamServer
  let folha: UpstreamServer
  let app: FastifyInstance
  let token: string

  beforeAll(async () => {
    jwks = await startJwksServer({ issuer: 'https://auth.test', audience: 'hr-core' })
    funcionarios = await startUpstream()
    ferias = await startUpstream()
    avaliacoes = await startUpstream()
    folha = await startUpstream()
    vi.stubEnv('AUTH_JWKS_URL', jwks.url)
    vi.stubEnv('FUNCIONARIO_SERVICE_URL', funcionarios.url)
    vi.stubEnv('FERIAS_SERVICE_URL', ferias.url)
    vi.stubEnv('AVALIACAO_SERVICE_URL', avaliacoes.url)
    vi.stubEnv('FOLHA_PAGAMENTO_SERVICE_URL', folha.url)
    vi.stubEnv('SWAGGER_ENABLED', 'false')
    token = await jwks.sign({ sub: 'u-1', roles: ['admin'] })
  })

  beforeEach(async () => {
    vi.resetModules()
    const mod = await import('../app.js')
    app = await mod.buildApp()
    await app.ready()
    funcionarios.requests.length = 0
    ferias.requests.length = 0
    avaliacoes.requests.length = 0
    folha.requests.length = 0
  })

  afterEach(async () => {
    await app.close()
  })

  afterAll(async () => {
    await Promise.all([
      jwks.stop(),
      funcionarios.stop(),
      ferias.stop(),
      avaliacoes.stop(),
      folha.stop(),
    ])
    vi.unstubAllEnvs()
  })

  it.each([
    ['/api/v1/funcionarios/123', () => funcionarios, '/funcionarios/123'],
    ['/api/v1/ferias/45', () => ferias, '/ferias/45'],
    ['/api/v1/avaliacoes/2026', () => avaliacoes, '/avaliacoes/2026'],
    ['/api/v1/folha-de-pagamento/jan', () => folha, '/folha-de-pagamento/jan'],
  ])(
    'roteia %s para o upstream correto reescrevendo o path',
    async (gatewayUrl, getServer, downstreamUrl) => {
      const res = await app.inject({
        method: 'GET',
        url: gatewayUrl,
        headers: { authorization: `Bearer ${token}` },
      })
      expect(res.statusCode).toBe(200)
      const server = getServer()
      expect(server.requests).toHaveLength(1)
      expect(server.requests[0]!.url).toBe(downstreamUrl)
    },
  )
})
