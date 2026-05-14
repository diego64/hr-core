import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'

const SERVICE_NAME = 'api-gateway' as const

const healthResponseSchema = z
  .object({
    status: z.literal('ok'),
    service: z.literal(SERVICE_NAME),
    timestamp: z.iso.datetime(),
  })
  .describe('Resposta padrão do liveness probe.')

const readyResponseSchema = z
  .object({
    status: z.literal('ready'),
    service: z.literal(SERVICE_NAME),
    timestamp: z.iso.datetime(),
  })
  .describe('Resposta padrão do readiness probe.')

export const healthRoutes: FastifyPluginAsyncZod = async (fastify) => {
  fastify.get(
    '/health',
    {
      schema: {
        tags: ['System'],
        summary: 'Liveness probe',
        description:
          'Indica que o processo está vivo e respondendo. Usado por orquestradores (Kubernetes/Argo CD) para decidir restart.',
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
    '/ready',
    {
      schema: {
        tags: ['System'],
        summary: 'Readiness probe',
        description:
          'Indica que o gateway está pronto para receber tráfego. Hoje é estático; deveria validar dependências críticas (JWKS, downstreams) — ver Roadmap no README.',
        response: { 200: readyResponseSchema },
      },
    },
    async () => ({
      status: 'ready' as const,
      service: SERVICE_NAME,
      timestamp: new Date().toISOString(),
    }),
  )
}
