import type { FastifyInstance } from 'fastify'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

interface SwaggerOperation {
  security?: Array<Record<string, unknown>>
  responses?: Record<string, unknown>
}

interface SwaggerSpec {
  openapi: string
  info: { title: string }
  servers: Array<{ url: string }>
  tags: Array<{ name: string }>
  paths: Record<string, Record<string, SwaggerOperation>>
  components: {
    securitySchemes: Record<string, Record<string, string>>
    schemas: Record<string, { required?: string[] }>
  }
}

describe('swagger plugin', () => {
  let app: FastifyInstance | null = null

  beforeEach(() => {
    vi.resetModules()
  })

  afterEach(async () => {
    if (app) await app.close()
    app = null
    vi.unstubAllEnvs()
  })

  async function buildAppWithEnv(env: Record<string, string>): Promise<FastifyInstance> {
    for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v)
    vi.resetModules()
    const mod = await import('../app.js')
    const instance = await mod.buildApp()
    await instance.ready()
    return instance
  }

  describe('quando SWAGGER_ENABLED=true', () => {
    it('serve a OpenAPI 3.1 em /docs/json', async () => {
      app = await buildAppWithEnv({ SWAGGER_ENABLED: 'true', SWAGGER_ROUTE_PREFIX: '/docs' })
      const res = await app.inject({ method: 'GET', url: '/docs/json' })
      expect(res.statusCode).toBe(200)
      const body = JSON.parse(res.payload) as SwaggerSpec
      expect(body.openapi).toBe('3.1.0')
      expect(body.info.title).toContain('HR Core')
    })

    it('inclui /health e /ready entre os paths', async () => {
      app = await buildAppWithEnv({ SWAGGER_ENABLED: 'true' })
      const res = await app.inject({ method: 'GET', url: '/docs/json' })
      const body = JSON.parse(res.payload) as SwaggerSpec
      const paths = Object.keys(body.paths)
      expect(paths).toContain('/health')
      expect(paths).toContain('/ready')
    })

    it('injeta catch-all canônica /api/v1/funcionarios/{rest} e remove wildcards do http-proxy', async () => {
      app = await buildAppWithEnv({ SWAGGER_ENABLED: 'true' })
      const res = await app.inject({ method: 'GET', url: '/docs/json' })
      const body = JSON.parse(res.payload) as SwaggerSpec
      const paths = Object.keys(body.paths)
      // O http-proxy registra rotas como `/api/v1/funcionarios/` e `/api/v1/funcionarios/{*}`.
      // O transformObject deve ter removido essas e deixado APENAS a `{rest}`.
      const funcionarios = paths.filter((p) => p.startsWith('/api/v1/funcionarios'))
      expect(funcionarios).toEqual(['/api/v1/funcionarios/{rest}'])
    })

    it('declara security scheme bearerAuth com bearerFormat=JWT', async () => {
      app = await buildAppWithEnv({ SWAGGER_ENABLED: 'true' })
      const res = await app.inject({ method: 'GET', url: '/docs/json' })
      const spec = JSON.parse(res.payload) as SwaggerSpec
      const bearer = spec.components.securitySchemes.bearerAuth!
      expect(bearer.type).toBe('http')
      expect(bearer.scheme).toBe('bearer')
      expect(bearer.bearerFormat).toBe('JWT')
    })

    it('expõe o schema Problem (RFC 7807) em components.schemas', async () => {
      app = await buildAppWithEnv({ SWAGGER_ENABLED: 'true' })
      const res = await app.inject({ method: 'GET', url: '/docs/json' })
      const spec = JSON.parse(res.payload) as SwaggerSpec
      expect(spec.components.schemas.Problem).toBeTruthy()
      expect(spec.components.schemas.Problem!.required).toEqual(['type', 'title', 'status'])
    })

    it('só registra tags de serviços com a URL configurada', async () => {
      app = await buildAppWithEnv({
        SWAGGER_ENABLED: 'true',
        // só funcionarios configurado, demais não
        FERIAS_SERVICE_URL: '',
        AVALIACAO_SERVICE_URL: '',
        FOLHA_PAGAMENTO_SERVICE_URL: '',
      })
      const res = await app.inject({ method: 'GET', url: '/docs/json' })
      const tags = (JSON.parse(res.payload) as SwaggerSpec).tags.map((t) => t.name)
      expect(tags).toContain('Funcionários')
      expect(tags).not.toContain('Férias')
      expect(tags).not.toContain('Avaliações')
    })

    it('cada path de proxy declara security bearerAuth + responses 401/403/429/5XX', async () => {
      app = await buildAppWithEnv({ SWAGGER_ENABLED: 'true' })
      const res = await app.inject({ method: 'GET', url: '/docs/json' })
      const path = (JSON.parse(res.payload) as SwaggerSpec).paths['/api/v1/funcionarios/{rest}']
      expect(path).toBeTruthy()
      const getOp = path!.get!
      expect(getOp.security).toEqual([{ bearerAuth: [] }])
      expect(Object.keys(getOp.responses ?? {})).toEqual(
        expect.arrayContaining(['2XX', '401', '403', '429', '5XX']),
      )
    })

    it('expõe Swagger UI em /docs (HTML)', async () => {
      app = await buildAppWithEnv({ SWAGGER_ENABLED: 'true' })
      const res = await app.inject({ method: 'GET', url: '/docs/' })
      expect(res.statusCode).toBe(200)
      expect(res.headers['content-type']).toContain('text/html')
    })

    it('honra SWAGGER_ROUTE_PREFIX customizado', async () => {
      app = await buildAppWithEnv({
        SWAGGER_ENABLED: 'true',
        SWAGGER_ROUTE_PREFIX: '/api-docs',
      })
      const inJson = await app.inject({ method: 'GET', url: '/api-docs/json' })
      expect(inJson.statusCode).toBe(200)
      const inDefault = await app.inject({ method: 'GET', url: '/docs/json' })
      expect(inDefault.statusCode).toBe(404)
    })

    it('usa HOST literal em servers[].url quando HOST != "0.0.0.0"', async () => {
      app = await buildAppWithEnv({
        SWAGGER_ENABLED: 'true',
        HOST: '127.0.0.1',
        PORT: '4321',
      })
      const res = await app.inject({ method: 'GET', url: '/docs/json' })
      const servers = (JSON.parse(res.payload) as SwaggerSpec).servers
      expect(servers[0]!.url).toBe('http://127.0.0.1:4321')
    })
  })

  describe('quando SWAGGER_ENABLED=false', () => {
    it('nem /docs nem /docs/json são registrados', async () => {
      app = await buildAppWithEnv({ SWAGGER_ENABLED: 'false' })
      const ui = await app.inject({ method: 'GET', url: '/docs/' })
      const json = await app.inject({ method: 'GET', url: '/docs/json' })
      expect(ui.statusCode).toBe(404)
      expect(json.statusCode).toBe(404)
    })
  })
})
