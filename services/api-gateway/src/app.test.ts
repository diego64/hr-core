import type { FastifyInstance } from 'fastify'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { buildApp } from './app.js'

describe('buildApp (genReqId)', () => {
  let app: FastifyInstance

  beforeEach(async () => {
    app = await buildApp()
    await app.ready()
  })

  afterEach(async () => {
    await app.close()
  })

  it('gera UUID quando X-Trace-Id não é enviado', async () => {
    const res = await app.inject({ method: 'GET', url: '/rota-inexistente' })
    expect(res.statusCode).toBe(404)
    const body = res.json()
    expect(typeof body.traceId).toBe('string')
    expect(body.traceId.length).toBeGreaterThan(20)
  })

  it('reusa X-Trace-Id quando cliente envia (header propagation)', async () => {
    const traceId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
    const res = await app.inject({
      method: 'GET',
      url: '/rota-inexistente',
      headers: { 'x-trace-id': traceId },
    })
    expect(res.statusCode).toBe(404)
    expect(res.json().traceId).toBe(traceId)
  })
})
