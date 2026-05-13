import { randomUUID } from 'node:crypto'

import sensible from '@fastify/sensible'
import Fastify, { type FastifyInstance } from 'fastify'
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod'

import { env } from './config/env.js'
import { registerErrorHandler } from './middlewares/error-handler.js'
import authPlugin from './plugins/auth.js'
import corsPlugin from './plugins/cors.js'
import metricsPlugin from './plugins/metrics.js'
import rateLimitPlugin from './plugins/rate-limit.js'
import rbacPlugin from './plugins/rbac.js'
import swaggerPlugin from './plugins/swagger.js'
import { healthRoutes } from './routes/health.js'
import { proxyRoutes } from './routes/proxy.js'

export async function buildApp(): Promise<FastifyInstance> {
  const useTransport = env.NODE_ENV === 'development'

  const app = Fastify({
    logger: {
      level: env.LOG_LEVEL,
      ...(useTransport
        ? { transport: { target: 'pino-pretty', options: { translateTime: 'SYS:standard' } } }
        : {}),
      base: { service: 'api-gateway' },
    },
    genReqId: (req) => {
      const incoming = req.headers['x-trace-id']
      if (typeof incoming === 'string' && incoming.length > 0) return incoming
      return randomUUID()
    },
    trustProxy: true,
    disableRequestLogging: false,
  })

  app.setValidatorCompiler(validatorCompiler)
  app.setSerializerCompiler(serializerCompiler)
  const typed = app.withTypeProvider<ZodTypeProvider>()

  registerErrorHandler(typed)
  await typed.register(sensible)
  await typed.register(metricsPlugin)
  await typed.register(corsPlugin)
  await typed.register(rateLimitPlugin)
  await typed.register(authPlugin)
  await typed.register(rbacPlugin)
  await typed.register(swaggerPlugin)

  await typed.register(healthRoutes)
  await typed.register(proxyRoutes)

  return app
}
