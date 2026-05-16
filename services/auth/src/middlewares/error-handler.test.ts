import Fastify, { type FastifyInstance } from 'fastify'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { z } from 'zod'

import { DomainError } from '../modules/domain/errors/domain-error.js'
import { registerErrorHandler } from './error-handler.js'

describe('middlewares.error-handler', () => {
  let app: FastifyInstance

  beforeEach(async () => {
    app = Fastify({ logger: false })
    registerErrorHandler(app)

    app.get('/zod-direct', async () => {
      // simula um service que lança ZodError direto (parse explícito);
      // o fastify-type-provider-zod converte erros de schema em FastifyError,
      // então cobrir o branch ZodError exige lançá-lo do handler.
      z.object({ n: z.number() }).parse({ n: 'nao-numero' })
    })
    app.get('/domain', async () => {
      throw new DomainError({
        code: 'teapot',
        title: "I'm a teapot",
        statusCode: 418,
        message: 'short and stout',
      })
    })
    app.get('/http-error', async () => {
      throw app.httpErrors.conflict('something conflicted')
    })
    app.get('/boom', async () => {
      throw new Error('internal explosion with secret query: SELECT * FROM ...')
    })
    app.get('/no-status', async () => {
      const err = new Error('weird') as Error & { statusCode?: number }
      throw err
    })
    app.get('/custom-status', async () => {
      // status fora do STATUS_TYPE_MAP (não bate em 400/401/403/404/409/422/429)
      const err = new Error('uncommon status') as Error & { statusCode?: number }
      err.statusCode = 418
      throw err
    })

    await app.register(import('@fastify/sensible'))
    await app.ready()
  })

  afterEach(async () => {
    await app.close()
  })

  it('returns 400 RFC 7807 for ZodError thrown from a handler', async () => {
    const res = await app.inject({ method: 'GET', url: '/zod-direct' })
    expect(res.statusCode).toBe(400)
    expect(res.headers['content-type']).toContain('application/problem+json')
    const body = res.json()
    expect(body.type).toContain('validation')
    expect(body.errors).toBeTruthy()
    expect(body.instance).toBe('/zod-direct')
  })

  it('maps DomainError to its declared statusCode + code', async () => {
    const res = await app.inject({ method: 'GET', url: '/domain' })
    expect(res.statusCode).toBe(418)
    const body = res.json()
    expect(body.type).toContain('teapot')
    expect(body.title).toBe("I'm a teapot")
    expect(body.detail).toBe('short and stout')
  })

  it('maps fastify.httpErrors to the right STATUS_TYPE_MAP entry', async () => {
    const res = await app.inject({ method: 'GET', url: '/http-error' })
    expect(res.statusCode).toBe(409)
    const body = res.json()
    expect(body.type).toContain('conflict')
  })

  it('hides internals on 5xx (detail is generic, not the thrown message)', async () => {
    const res = await app.inject({ method: 'GET', url: '/boom' })
    expect(res.statusCode).toBe(500)
    const body = res.json()
    expect(body.detail).toBe('Internal server error')
    expect(body.type).toContain('internal')
    expect(JSON.stringify(body)).not.toContain('SELECT *')
  })

  it('falls back to status 500 when error has no statusCode', async () => {
    const res = await app.inject({ method: 'GET', url: '/no-status' })
    expect(res.statusCode).toBe(500)
  })

  it('not-found handler returns RFC 7807 404 with traceId', async () => {
    const res = await app.inject({ method: 'GET', url: '/nope' })
    expect(res.statusCode).toBe(404)
    expect(res.headers['content-type']).toContain('application/problem+json')
    const body = res.json()
    expect(body.type).toContain('not-found')
    expect(body.detail).toContain('GET /nope')
    expect(typeof body.traceId).toBe('string')
  })

  it('uses status-derived type URI when status is not in STATUS_TYPE_MAP', async () => {
    const res = await app.inject({ method: 'GET', url: '/custom-status' })
    expect(res.statusCode).toBe(418)
    const body = res.json()
    expect(body.type).toContain('/errors/418')
  })
})
