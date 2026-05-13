import type { FastifyPluginAsync, FastifyRequest } from 'fastify'
import fp from 'fastify-plugin'
import { createRemoteJWKSet, jwtVerify, errors as joseErrors } from 'jose'

import { env } from '../config/env.js'

export interface AuthenticatedUser {
  readonly sub: string
  readonly roles: readonly string[]
}

declare module 'fastify' {
  interface FastifyRequest {
    user?: AuthenticatedUser
  }
  interface FastifyInstance {
    authenticate: (request: FastifyRequest) => Promise<void>
  }
}

const authPlugin: FastifyPluginAsync = async (fastify) => {
  const jwks = createRemoteJWKSet(new URL(env.AUTH_JWKS_URL), {
    cacheMaxAge: 10 * 60 * 1000,
    cooldownDuration: 30 * 1000,
  })

  fastify.decorate('authenticate', async function authenticate(request: FastifyRequest) {
    const header = request.headers.authorization
    if (!header || !header.startsWith('Bearer ')) {
      throw fastify.httpErrors.unauthorized('Missing or malformed Authorization header')
    }
    const token = header.slice('Bearer '.length)

    try {
      const { payload } = await jwtVerify(token, jwks, {
        issuer: env.AUTH_JWT_ISSUER,
        audience: env.AUTH_JWT_AUDIENCE,
      })

      if (typeof payload.sub !== 'string') {
        throw fastify.httpErrors.unauthorized('Token missing sub claim')
      }

      const rawRoles = (payload as Record<string, unknown>).roles
      const roles = Array.isArray(rawRoles)
        ? rawRoles.filter((r): r is string => typeof r === 'string')
        : []

      request.user = { sub: payload.sub, roles }
    } catch (cause) {
      if (cause instanceof joseErrors.JOSEError) {
        throw fastify.httpErrors.unauthorized(`Token verification failed: ${cause.code}`)
      }
      throw cause
    }
  })
}

export default fp(authPlugin, { name: 'auth' })
