/**
 * Cobre os 4 ramos do error handler:
 *   1. ZodError       → 400 com problem.errors (campo .fieldErrors achatado)
 *   2. DomainError    → status do domínio, type derivado do code
 *   3. error 4xx      → STATUS_TYPE_MAP ou fallback
 *   4. error 5xx/sem  → tipo internal, detail mascarado
 *
 * Mais o notFoundHandler em 404.
 */
import Fastify, { type FastifyInstance } from 'fastify'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { z } from 'zod'

import { CpfInvalidoError } from '../modules/domain/errors/domain-error.js'
import { registerErrorHandler } from './error-handler.js'

describe('error-handler middleware', () => {
  let app: FastifyInstance

  beforeEach(async () => {
    app = Fastify({ logger: false })
    registerErrorHandler(app)
    app.get('/zod', async () => {
      // dispara ZodError direto
      z.object({ x: z.string() }).parse({ x: 42 })
      return { ok: true }
    })
    app.get('/domain', async () => {
      throw new CpfInvalidoError('000.000.000-00')
    })
    app.get('/http-409', async () => {
      throw (
        app.httpErrors?.conflict('coisa duplicada') ??
        Object.assign(new Error('coisa duplicada'), { statusCode: 409 })
      )
    })
    app.get('/http-418', async () => {
      // status fora do STATUS_TYPE_MAP → cai no fallback `errors/418`
      throw Object.assign(new Error('teapot'), { statusCode: 418, name: 'TeapotError' })
    })
    app.get('/http-500', async () => {
      throw Object.assign(new Error('algo escondido'), { statusCode: 500, name: 'BoomError' })
    })
    app.get('/sem-status', async () => {
      throw new Error('sem statusCode definido')
    })
    await app.ready()
  })

  afterEach(async () => {
    await app.close()
  })

  it('ZodError → 400 application/problem+json com errors achatado', async () => {
    const res = await app.inject({ method: 'GET', url: '/zod' })
    expect(res.statusCode).toBe(400)
    expect(res.headers['content-type']).toContain('application/problem+json')
    const body = JSON.parse(res.payload) as {
      type: string
      status: number
      errors: Record<string, string[]>
    }
    expect(body.type).toContain('errors/validation')
    expect(body.status).toBe(400)
    expect(body.errors).toHaveProperty('x')
  })

  it('DomainError → status do domínio (422 CpfInvalido), type derivado do code', async () => {
    const res = await app.inject({ method: 'GET', url: '/domain' })
    expect(res.statusCode).toBe(422)
    const body = JSON.parse(res.payload) as { type: string; title: string; status: number }
    expect(body.type).toBe('https://hr-core/errors/cpf-invalido')
    expect(body.title).toBe('CPF inválido')
    expect(body.status).toBe(422)
  })

  it('Error 4xx com statusCode mapeado (409) → type do STATUS_TYPE_MAP', async () => {
    const res = await app.inject({ method: 'GET', url: '/http-409' })
    expect(res.statusCode).toBe(409)
    const body = JSON.parse(res.payload) as { type: string }
    expect(body.type).toBe('https://hr-core/errors/conflict')
  })

  it('Error 4xx fora do mapa (418) → fallback errors/{status}', async () => {
    const res = await app.inject({ method: 'GET', url: '/http-418' })
    expect(res.statusCode).toBe(418)
    const body = JSON.parse(res.payload) as { type: string; title: string }
    expect(body.type).toBe('https://hr-core/errors/418')
    expect(body.title).toBe('TeapotError')
  })

  it('Error 5xx → type internal, detail mascarado (não vaza message original)', async () => {
    const res = await app.inject({ method: 'GET', url: '/http-500' })
    expect(res.statusCode).toBe(500)
    const body = JSON.parse(res.payload) as { type: string; detail: string }
    expect(body.type).toBe('https://hr-core/errors/internal')
    expect(body.detail).toBe('Internal server error')
    expect(body.detail).not.toContain('escondido')
  })

  it('Error sem statusCode → trata como 500', async () => {
    const res = await app.inject({ method: 'GET', url: '/sem-status' })
    expect(res.statusCode).toBe(500)
    const body = JSON.parse(res.payload) as { detail: string; title: string }
    expect(body.detail).toBe('Internal server error')
    // Quando o nome do Error não foi customizado, cai no fallback "Internal Server Error"
    expect(['Error', 'Internal Server Error']).toContain(body.title)
  })

  it('notFoundHandler → 404 RFC 7807 com path no detail', async () => {
    const res = await app.inject({ method: 'GET', url: '/rota-que-nao-existe' })
    expect(res.statusCode).toBe(404)
    expect(res.headers['content-type']).toContain('application/problem+json')
    const body = JSON.parse(res.payload) as { type: string; detail: string }
    expect(body.type).toBe('https://hr-core/errors/not-found')
    expect(body.detail).toContain('/rota-que-nao-existe')
  })
})
