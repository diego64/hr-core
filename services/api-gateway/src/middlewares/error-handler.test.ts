import sensible from '@fastify/sensible'
import Fastify, { type FastifyInstance } from 'fastify'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { z } from 'zod'

import { registerErrorHandler } from './error-handler.js'

describe('middlewares.error-handler', () => {
  let app: FastifyInstance

  beforeEach(async () => {
    app = Fastify({ logger: false })
    registerErrorHandler(app)
    await app.register(sensible)

    app.get('/zod', async () => {
      // ZodError lançado direto do handler (não passa pelo validator do Fastify)
      z.object({ n: z.number() }).parse({ n: 'nao-numero' })
    })
    app.get('/http-401', async () => {
      throw app.httpErrors.unauthorized('missing bearer')
    })
    app.get('/http-403', async () => {
      throw app.httpErrors.forbidden('not your role')
    })
    app.get('/http-429', async () => {
      throw app.httpErrors.tooManyRequests('slow down')
    })
    app.get('/boom', async () => {
      throw new Error('internal explosion with secret query: SELECT *')
    })
    app.get('/no-status', async () => {
      throw new Error('weird — no statusCode')
    })
    app.get('/custom-418', async () => {
      const err = new Error('teapot') as Error & { statusCode?: number }
      err.statusCode = 418
      throw err
    })

    await app.ready()
  })

  afterEach(async () => {
    await app.close()
  })

  it('returns 400 RFC 7807 for ZodError thrown from handler', async () => {
    const res = await app.inject({ method: 'GET', url: '/zod' })
    expect(res.statusCode).toBe(400)
    expect(res.headers['content-type']).toContain('application/problem+json')
    const body = res.json()
    expect(body.type).toContain('validation')
    expect(body.errors).toBeTruthy()
    expect(body.instance).toBe('/zod')
    expect(typeof body.traceId).toBe('string')
  })

  it('maps 401 via STATUS_TYPE_MAP', async () => {
    const res = await app.inject({ method: 'GET', url: '/http-401' })
    expect(res.statusCode).toBe(401)
    expect(res.json().type).toContain('unauthorized')
  })

  it('maps 403 via STATUS_TYPE_MAP', async () => {
    const res = await app.inject({ method: 'GET', url: '/http-403' })
    expect(res.statusCode).toBe(403)
    expect(res.json().type).toContain('forbidden')
  })

  it('maps 429 via STATUS_TYPE_MAP', async () => {
    const res = await app.inject({ method: 'GET', url: '/http-429' })
    expect(res.statusCode).toBe(429)
    expect(res.json().type).toContain('rate-limit')
  })

  it('hides internals on 5xx (detail is generic, no thrown message leak)', async () => {
    const res = await app.inject({ method: 'GET', url: '/boom' })
    expect(res.statusCode).toBe(500)
    const body = res.json()
    expect(body.detail).toBe('Internal server error')
    expect(body.type).toContain('internal')
    expect(JSON.stringify(body)).not.toContain('SELECT *')
  })

  it('defaults to status 500 when error has no statusCode', async () => {
    const res = await app.inject({ method: 'GET', url: '/no-status' })
    expect(res.statusCode).toBe(500)
  })

  it('uses status-derived type URI when status not in STATUS_TYPE_MAP', async () => {
    const res = await app.inject({ method: 'GET', url: '/custom-418' })
    expect(res.statusCode).toBe(418)
    expect(res.json().type).toContain('/errors/418')
  })

  it('not-found handler returns RFC 7807 404 with traceId + path', async () => {
    const res = await app.inject({ method: 'GET', url: '/rota-inexistente' })
    expect(res.statusCode).toBe(404)
    expect(res.headers['content-type']).toContain('application/problem+json')
    const body = res.json()
    expect(body.type).toContain('not-found')
    expect(body.detail).toContain('GET /rota-inexistente')
    expect(typeof body.traceId).toBe('string')
  })
})
