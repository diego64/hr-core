/**
 * Cobre as 2 fatias do swagger plugin:
 *  - SWAGGER_ENABLED=false → plugin é no-op (sem rotas /docs)
 *  - SWAGGER_ENABLED=true  → expõe /docs/json com spec OpenAPI 3.1, securityScheme
 *    bearerAuth, schema Problem e enriquece rotas /funcionarios* com:
 *      • responses 400/401/403/404/409/422/5XX
 *      • security [{ bearerAuth: [] }]
 *
 * Para isolar a leitura de env.SWAGGER_ENABLED no register, cada caso usa
 * vi.resetModules + dynamic import depois de vi.stubEnv.
 */
import Fastify, { type FastifyInstance } from 'fastify'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod'
import { z } from 'zod'

interface SwaggerSpec {
  openapi: string
  components: {
    securitySchemes?: Record<string, unknown>
    schemas?: Record<string, unknown>
  }
  paths: Record<
    string,
    Record<
      string,
      {
        responses?: Record<string, unknown>
        security?: Array<Record<string, unknown>>
      }
    >
  >
}

async function buildAppWithSwagger(): Promise<FastifyInstance> {
  vi.resetModules()
  const mod = await import('./swagger.js')
  const app = Fastify({ logger: false }).withTypeProvider<ZodTypeProvider>()
  app.setValidatorCompiler(validatorCompiler)
  app.setSerializerCompiler(serializerCompiler)
  await app.register(mod.default)
  // rota /funcionarios para verificar enrichment
  app.get(
    '/funcionarios/teste',
    { schema: { tags: ['Funcionários'], response: { 200: z.object({ ok: z.boolean() }) } } },
    async () => ({ ok: true }),
  )
  await app.ready()
  return app
}

describe('swagger middleware', () => {
  let app: FastifyInstance

  beforeEach(() => {
    vi.unstubAllEnvs()
  })

  afterEach(async () => {
    if (app) await app.close()
    vi.unstubAllEnvs()
  })

  it('SWAGGER_ENABLED=false → /docs/json não existe (404)', async () => {
    vi.stubEnv('SWAGGER_ENABLED', 'false')
    app = await buildAppWithSwagger()
    const res = await app.inject({ method: 'GET', url: '/docs/json' })
    expect(res.statusCode).toBe(404)
  })

  it('SWAGGER_ENABLED=true → /docs/json retorna spec OpenAPI 3.1', async () => {
    vi.stubEnv('SWAGGER_ENABLED', 'true')
    app = await buildAppWithSwagger()
    const res = await app.inject({ method: 'GET', url: '/docs/json' })
    expect(res.statusCode).toBe(200)
    const spec = JSON.parse(res.payload) as SwaggerSpec
    expect(spec.openapi).toBe('3.1.0')
    expect(spec.components.securitySchemes).toHaveProperty('bearerAuth')
    expect(spec.components.schemas).toHaveProperty('Problem')
  })

  it('SWAGGER_ENABLED=true → rotas /funcionarios* ganham responses padrão + security bearerAuth', async () => {
    vi.stubEnv('SWAGGER_ENABLED', 'true')
    app = await buildAppWithSwagger()
    const res = await app.inject({ method: 'GET', url: '/docs/json' })
    const spec = JSON.parse(res.payload) as SwaggerSpec
    const op = spec.paths['/funcionarios/teste']?.['get']
    expect(op).toBeDefined()
    expect(op!.responses).toHaveProperty('400')
    expect(op!.responses).toHaveProperty('401')
    expect(op!.responses).toHaveProperty('403')
    expect(op!.responses).toHaveProperty('404')
    expect(op!.responses).toHaveProperty('409')
    expect(op!.responses).toHaveProperty('422')
    expect(op!.responses).toHaveProperty('5XX')
    expect(op!.security).toEqual([{ bearerAuth: [] }])
  })

  it('SWAGGER_ENABLED=true → /docs serve a UI (status 200/302 conforme redirect)', async () => {
    vi.stubEnv('SWAGGER_ENABLED', 'true')
    app = await buildAppWithSwagger()
    const res = await app.inject({ method: 'GET', url: '/docs/' })
    expect(res.statusCode).toBe(200)
  })
})
