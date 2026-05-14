import type { FastifyInstance } from 'fastify'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { buildApp } from '../app.js'

describe('health routes', () => {
  let app: FastifyInstance

  beforeEach(async () => {
    app = await buildApp()
    await app.ready()
  })

  afterEach(async () => {
    await app.close()
  })

  it('GET /health responds 200 with service status', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' })

    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.status).toBe('ok')
    expect(body.service).toBe('api-gateway')
    expect(typeof body.timestamp).toBe('string')
  })

  it('GET /ready responds 200 with readiness status', async () => {
    const res = await app.inject({ method: 'GET', url: '/ready' })

    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.status).toBe('ready')
  })

  it('unknown route returns RFC 7807 problem details with 404', async () => {
    const res = await app.inject({ method: 'GET', url: '/does-not-exist' })

    expect(res.statusCode).toBe(404)
    expect(res.headers['content-type']).toContain('application/problem+json')
    const body = res.json()
    expect(body.status).toBe(404)
    expect(body.title).toBe('Not Found')
    expect(typeof body.traceId).toBe('string')
  })
})
