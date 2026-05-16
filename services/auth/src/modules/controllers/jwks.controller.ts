import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'

import type { ActiveKey } from '../services/key.service.js'
import { jwksResponseSchema } from '../schemas/auth.schema.js'

export function buildJwksRoutes(key: ActiveKey): FastifyPluginAsyncZod {
  return async (fastify) => {
    fastify.get(
      '/.well-known/jwks.json',
      {
        schema: {
          tags: ['Auth'],
          summary: 'Lista as chaves públicas usadas para verificar JWTs (JWKS)',
          response: { 200: jwksResponseSchema },
        },
      },
      async (_, reply) => {
        // Headers para que o api-gateway (jose.createRemoteJWKSet) consiga cachear bem.
        reply.header('cache-control', 'public, max-age=600')
        return { keys: [key.publicJwk as Record<string, unknown>] }
      },
    )
  }
}
