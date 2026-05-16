import sensible from '@fastify/sensible'
import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { registerErrorHandler } from '../middlewares/error-handler.js'
import authPluginSchema from './auth.js'
import rbacPlugin from './rbac.js'

describe('rbac plugin', () => {
  let app: FastifyInstance

  beforeEach(async () => {
    app = Fastify({ logger: false })
    registerErrorHandler(app)
    await app.register(sensible)
    // rbac declara dependency em 'auth' — precisa estar registrado primeiro
    await app.register(authPluginSchema)
    await app.register(rbacPlugin)

    // Helper que simula que o auth já populou request.user
    function fakeAuth(user: { sub: string; roles: readonly string[] } | undefined) {
      return async (request: FastifyRequest) => {
        if (user) {
          request.user = user
        }
      }
    }

    app.get(
      '/admin-only',
      {
        preHandler: [fakeAuth({ sub: 'u-1', roles: ['admin'] }), app.requireRole('admin')],
      },
      async () => ({ ok: true }),
    )
    app.get(
      '/admin-or-hr',
      {
        preHandler: [fakeAuth({ sub: 'u-1', roles: ['hr'] }), app.requireRole(['admin', 'hr'])],
      },
      async () => ({ ok: true }),
    )
    app.get(
      '/needs-admin-but-user-is-not',
      {
        preHandler: [fakeAuth({ sub: 'u-1', roles: ['guest'] }), app.requireRole('admin')],
      },
      async () => ({ ok: true }),
    )
    app.get(
      '/no-user',
      {
        preHandler: [fakeAuth(undefined), app.requireRole('admin')],
      },
      async () => ({ ok: true }),
    )

    await app.ready()
    // silencia o warning typescript-eslint não-usado
    void authPluginSchema
  })

  afterEach(async () => {
    await app.close()
  })

  it('allows when user has the required role (string form)', async () => {
    const res = await app.inject({ method: 'GET', url: '/admin-only' })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ ok: true })
  })

  it('allows when user has any role from the array form', async () => {
    const res = await app.inject({ method: 'GET', url: '/admin-or-hr' })
    expect(res.statusCode).toBe(200)
  })

  it('returns 403 with the list of accepted roles when none matches', async () => {
    const res = await app.inject({ method: 'GET', url: '/needs-admin-but-user-is-not' })
    expect(res.statusCode).toBe(403)
    const body = res.json()
    expect(body.detail).toContain('Insufficient role')
    expect(body.detail).toContain('admin')
  })

  it('returns 401 when there is no authenticated user', async () => {
    const res = await app.inject({ method: 'GET', url: '/no-user' })
    expect(res.statusCode).toBe(401)
    expect(res.json().detail).toBe('Authentication required')
  })
})
