import type { FastifyInstance } from 'fastify'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { buildApp } from '../app.js'

describe('auth plugin', () => {
  let app: FastifyInstance

  beforeEach(async () => {
    app = await buildApp()
    await app.ready()
  })

  afterEach(async () => {
    await app.close()
  })

  it('rejects request without Authorization header → 401 RFC 7807', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/funcionarios' })

    expect(res.statusCode).toBe(401)
    expect(res.headers['content-type']).toContain('application/problem+json')
    const body = res.json()
    expect(body.status).toBe(401)
    expect(body.title).toBeDefined()
    expect(body.traceId).toBeDefined()
  })

  it('rejects malformed Authorization header (no Bearer prefix) → 401', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/funcionarios',
      headers: { authorization: 'Basic abc123' },
    })

    expect(res.statusCode).toBe(401)
    const body = res.json()
    expect(body.detail).toMatch(/Authorization/)
  })

  it('rejects Bearer with garbage token → 401', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/funcionarios',
      headers: { authorization: 'Bearer not.a.valid.jwt' },
    })

    expect(res.statusCode).toBe(401)
    const body = res.json()
    expect(body.type).toContain('errors')
  })

  it('public route /health bypasses authentication', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' })

    expect(res.statusCode).toBe(200)
  })
})
