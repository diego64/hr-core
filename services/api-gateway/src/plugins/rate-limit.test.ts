import type { FastifyInstance } from 'fastify'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { buildApp } from '../app.js'

describe('rate limit plugin', () => {
  let app: FastifyInstance

  beforeEach(async () => {
    app = await buildApp()
    await app.ready()
  })

  afterEach(async () => {
    await app.close()
  })

  it('allows requests under the configured limit', async () => {
    for (let i = 0; i < 5; i++) {
      const res = await app.inject({ method: 'GET', url: '/health' })
      expect(res.statusCode).toBe(200)
    }
  })

  it('returns 429 + RFC 7807 once the window limit is exceeded', async () => {
    for (let i = 0; i < 5; i++) {
      await app.inject({ method: 'GET', url: '/health' })
    }

    const res = await app.inject({ method: 'GET', url: '/health' })

    expect(res.statusCode).toBe(429)
    const body = res.json()
    expect(body.status).toBe(429)
    expect(body.title).toBe('Too Many Requests')
    expect(body.type).toContain('rate-limit')
  })
})
