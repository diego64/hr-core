import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'

import type { AuthService, AuthResult } from '../services/auth.service.js'
import {
  credentialsSchema,
  refreshSchema,
  tokenPairResponseSchema,
} from '../schemas/auth.schema.js'

function toResponse(result: AuthResult) {
  return {
    user: result.user,
    accessToken: result.tokens.accessToken,
    refreshToken: result.tokens.refreshToken,
    accessTokenExpiresAt: result.tokens.accessTokenExpiresAt.toISOString(),
    refreshTokenExpiresAt: result.tokens.refreshTokenExpiresAt.toISOString(),
  }
}

export function buildAuthRoutes(authService: AuthService): FastifyPluginAsyncZod {
  return async (fastify) => {
    fastify.post(
      '/register',
      {
        schema: {
          tags: ['Auth'],
          summary: 'Cria um novo usuário e retorna um par de tokens',
          body: credentialsSchema,
          response: { 201: tokenPairResponseSchema },
        },
      },
      async (request, reply) => {
        const result = await authService.register({
          email: request.body.email,
          password: request.body.password,
          context: { userAgent: request.headers['user-agent'] ?? null, ip: request.ip },
        })
        return reply.status(201).send(toResponse(result))
      },
    )

    fastify.post(
      '/login',
      {
        schema: {
          tags: ['Auth'],
          summary: 'Autentica um usuário existente e emite um par de tokens',
          body: credentialsSchema,
          response: { 200: tokenPairResponseSchema },
        },
      },
      async (request) => {
        const result = await authService.login({
          email: request.body.email,
          password: request.body.password,
          context: { userAgent: request.headers['user-agent'] ?? null, ip: request.ip },
        })
        return toResponse(result)
      },
    )

    fastify.post(
      '/refresh',
      {
        schema: {
          tags: ['Auth'],
          summary: 'Troca um refresh token válido por um novo par (rotation)',
          body: refreshSchema,
          response: { 200: tokenPairResponseSchema },
        },
      },
      async (request) => {
        const result = await authService.refresh({
          refreshToken: request.body.refreshToken,
          context: { userAgent: request.headers['user-agent'] ?? null, ip: request.ip },
        })
        return toResponse(result)
      },
    )

    fastify.post(
      '/logout',
      {
        schema: {
          tags: ['Auth'],
          summary: 'Revoga um refresh token específico (idempotente)',
          description:
            'Revoga o refresh token informado. Idempotente: tokens inválidos/expirados ' +
            'também retornam 204 (não vaza informação sobre existência da sessão).',
          body: refreshSchema,
          // Sem declaração de schema para 204 — corpo vazio é o default
          // do Fastify e o jsonSchemaTransform do fastify-type-provider-zod
          // não aceita "null" como response Zod nessa versão.
        },
      },
      async (request, reply) => {
        await authService.logout({ refreshToken: request.body.refreshToken })
        return reply.status(204).send()
      },
    )
  }
}
