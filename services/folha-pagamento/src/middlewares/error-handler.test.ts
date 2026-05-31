/**
 * Cobre os 4 paths do error handler RFC 7807:
 *   1. ZodError → 400 type=validation com errors field-by-field
 *   2. DomainError → status do erro com type baseado no code
 *   3. Erro genérico com statusCode <500 → STATUS_TYPE_MAP[status]
 *   4. Erro genérico com statusCode >=500 ou ausente → 'internal' + log.error
 *
 * E o setNotFoundHandler.
 */
import Fastify, { type FastifyInstance } from 'fastify'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { z, ZodError } from 'zod'

import { DomainError } from '../modules/domain/errors/domain-error.js'
import { registerErrorHandler } from './error-handler.js'

interface ProblemBody {
  type: string
  title: string
  status: number
  detail?: string
  instance?: string
  traceId?: string
  errors?: Record<string, string[]>
}

describe('error-handler', () => {
  let app: FastifyInstance

  beforeAll(() => {
    // Silencia logs do Fastify durante o teste — ainda assim o handler chama
    // log.warn / log.error e essas branches são contabilizadas.
  })

  afterEach(async () => {
    if (app) await app.close()
  })

  async function buildApp(routes: (app: FastifyInstance) => void): Promise<FastifyInstance> {
    app = Fastify({ logger: false })
    registerErrorHandler(app)
    routes(app)
    await app.ready()
    return app
  }

  it('ZodError → 400 type=validation com errors field-by-field', async () => {
    await buildApp((a) => {
      a.get('/zod', () => {
        const schema = z.object({ email: z.email() })
        // Throw real ZodError pelo parse
        schema.parse({ email: 'invalido' })
        return { ok: true }
      })
    })

    const res = await app.inject({ method: 'GET', url: '/zod' })
    expect(res.statusCode).toBe(400)
    expect(res.headers['content-type']).toContain('application/problem+json')
    const body = res.json<ProblemBody>()
    expect(body.type).toBe('https://hr-core/errors/validation')
    expect(body.title).toBe('Validation Failed')
    expect(body.errors).toBeDefined()
    expect(body.traceId).toBeTruthy()
    // sanity: o ZodError veio do parse manual, não do schema da rota
    expect(body).toHaveProperty('errors')
  })

  it('DomainError → status do erro com type=code', async () => {
    class TesteDomainError extends DomainError {
      constructor() {
        super({
          code: 'teste-erro',
          title: 'Erro de Teste',
          message: 'detalhe específico do erro de teste',
          statusCode: 422,
        })
      }
    }

    await buildApp((a) => {
      a.get('/domain', () => {
        throw new TesteDomainError()
      })
    })

    const res = await app.inject({ method: 'GET', url: '/domain' })
    expect(res.statusCode).toBe(422)
    const body = res.json<ProblemBody>()
    expect(body.type).toBe('https://hr-core/errors/teste-erro')
    expect(body.title).toBe('Erro de Teste')
    expect(body.detail).toBe('detalhe específico do erro de teste')
  })

  it('Erro genérico statusCode<500 → tipo do STATUS_TYPE_MAP', async () => {
    await buildApp((a) => {
      a.get('/conflict', () => {
        const err = new Error('Conflito de exemplo') as Error & { statusCode?: number }
        err.statusCode = 409
        throw err
      })
    })

    const res = await app.inject({ method: 'GET', url: '/conflict' })
    expect(res.statusCode).toBe(409)
    const body = res.json<ProblemBody>()
    expect(body.type).toBe('https://hr-core/errors/conflict')
    expect(body.detail).toBe('Conflito de exemplo')
  })

  it('Erro genérico statusCode 4xx fora do mapa → fallback errors/{status}', async () => {
    await buildApp((a) => {
      a.get('/418', () => {
        const err = new Error('Sou um bule') as Error & { statusCode?: number }
        err.statusCode = 418
        throw err
      })
    })

    const res = await app.inject({ method: 'GET', url: '/418' })
    expect(res.statusCode).toBe(418)
    const body = res.json<ProblemBody>()
    expect(body.type).toBe('https://hr-core/errors/418')
  })

  it('Erro genérico statusCode 500 → type=internal, detail mascarado, log.error', async () => {
    await buildApp((a) => {
      a.get('/internal', () => {
        const err = new Error('Erro real interno (não deve vazar pro detail)') as Error & {
          statusCode?: number
        }
        err.statusCode = 500
        throw err
      })
    })

    const res = await app.inject({ method: 'GET', url: '/internal' })
    expect(res.statusCode).toBe(500)
    const body = res.json<ProblemBody>()
    expect(body.type).toBe('https://hr-core/errors/internal')
    // Detail é mascarado para não vazar message original
    expect(body.detail).toBe('Internal server error')
  })

  it('Erro sem statusCode → default 500 + type=internal', async () => {
    await buildApp((a) => {
      a.get('/throw', () => {
        throw new Error('boom')
      })
    })

    const res = await app.inject({ method: 'GET', url: '/throw' })
    expect(res.statusCode).toBe(500)
    const body = res.json<ProblemBody>()
    expect(body.type).toBe('https://hr-core/errors/internal')
  })

  it('Erro sem name → fallback "Internal Server Error" ou "Error"', async () => {
    await buildApp((a) => {
      a.get('/anon', () => {
        const err = new Error('sem nome') as Error & { statusCode?: number }
        err.statusCode = 400
        err.name = ''
        throw err
      })
    })

    const res = await app.inject({ method: 'GET', url: '/anon' })
    expect(res.statusCode).toBe(400)
    const body = res.json<ProblemBody>()
    expect(body.title).toBe('Error')
  })

  it('Rota inexistente → 404 do setNotFoundHandler', async () => {
    await buildApp(() => {})
    const res = await app.inject({ method: 'GET', url: '/nao-existe' })
    expect(res.statusCode).toBe(404)
    expect(res.headers['content-type']).toContain('application/problem+json')
    const body = res.json<ProblemBody>()
    expect(body.type).toBe('https://hr-core/errors/not-found')
    expect(body.detail).toBe('Route GET /nao-existe not found')
  })

  it('ZodError chega via parse interno e flattenError gera fieldErrors corretos', async () => {
    await buildApp((a) => {
      a.get('/zod-multi', () => {
        const schema = z.object({ nome: z.string().min(3), idade: z.number().int().positive() })
        try {
          schema.parse({ nome: 'a', idade: -1 })
        } catch (e) {
          // Re-throw para o handler global
          throw e instanceof ZodError ? e : new Error(String(e))
        }
        return { ok: true }
      })
    })

    const res = await app.inject({ method: 'GET', url: '/zod-multi' })
    expect(res.statusCode).toBe(400)
    const body = res.json<ProblemBody>()
    expect(body.errors).toHaveProperty('nome')
    expect(body.errors).toHaveProperty('idade')
  })
})
