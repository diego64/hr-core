import type { FastifyInstance } from 'fastify'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { buildApp } from '../app.js'

describe('cors plugin', () => {
  let app: FastifyInstance

  beforeEach(async () => {
    app = await buildApp()
    await app.ready()
  })

  afterEach(async () => {
    await app.close()
  })

  it('echoes allowed origin on preflight OPTIONS', async () => {
    const res = await app.inject({
      method: 'OPTIONS',
      url: '/health',
      headers: {
        origin: 'http://allowed.test',
        'access-control-request-method': 'GET',
      },
    })

    expect(res.headers['access-control-allow-origin']).toBe('http://allowed.test')
    expect(res.headers['access-control-allow-credentials']).toBe('true')
  })

  it('does not echo origin when not in allowlist', async () => {
    const res = await app.inject({
      method: 'OPTIONS',
      url: '/health',
      headers: {
        origin: 'http://attacker.test',
        'access-control-request-method': 'GET',
      },
    })

    expect(res.headers['access-control-allow-origin']).toBeUndefined()
  })
})
