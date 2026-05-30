import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'

import { healthResponseSchema } from '../schemas/health.schema.js'

const SERVICE_NAME = 'avaliacao' as const

export const healthRoutes: FastifyPluginAsyncZod = async (fastify) => {
  fastify.get(
    '/health',
    {
      schema: {
        tags: ['System'],
        summary: 'Liveness probe',
        response: { 200: healthResponseSchema },
      },
    },
    async () => ({
      status: 'ok' as const,
      service: SERVICE_NAME,
      timestamp: new Date().toISOString(),
    }),
  )

  fastify.get(
    '/health/ready',
    {
      schema: {
        tags: ['System'],
        summary: 'Readiness probe',
        response: { 200: healthResponseSchema },
      },
    },
    async () => ({
      status: 'ok' as const,
      service: SERVICE_NAME,
      timestamp: new Date().toISOString(),
    }),
  )
}
