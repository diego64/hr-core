import { randomUUID } from 'node:crypto'

import sensible from '@fastify/sensible'
import Fastify, { type FastifyInstance } from 'fastify'
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod'
import type { Db } from 'mongodb'

import { env } from './config/env.js'
import corsPlugin from './middlewares/cors.js'
import { registerErrorHandler } from './middlewares/error-handler.js'
import metricsPlugin from './middlewares/metrics.js'
import swaggerPlugin from './middlewares/swagger.js'
import { buildAuthRoutes } from './modules/controllers/auth.controller.js'
import { healthRoutes } from './modules/controllers/health.controller.js'
import { buildJwksRoutes } from './modules/controllers/jwks.controller.js'
import { RefreshTokenRepository } from './modules/repositories/refresh-token.repository.js'
import { UserRepository } from './modules/repositories/user.repository.js'
import { AuthService } from './modules/services/auth.service.js'
import { loadActiveKey } from './modules/services/key.service.js'

export interface BuildAppDeps {
  readonly db: Db
}

export async function buildApp(deps: BuildAppDeps): Promise<FastifyInstance> {
  const useTransport = env.NODE_ENV === 'development'

  const app = Fastify({
    logger: {
      level: env.LOG_LEVEL,
      ...(useTransport
        ? { transport: { target: 'pino-pretty', options: { translateTime: 'SYS:standard' } } }
        : {}),
      base: { service: 'auth' },
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
  // Swagger registrado ANTES das rotas — usa onRoute hook para descobrir
  // os schemas Zod declarados em cada handler.
  await typed.register(swaggerPlugin)

  // Bootstrap dos services (singleton no app)
  const userRepo = new UserRepository(deps.db)
  const refreshRepo = new RefreshTokenRepository(deps.db)
  const key = await loadActiveKey()
  const authService = new AuthService(userRepo, refreshRepo, key)

  await typed.register(healthRoutes)
  await typed.register(buildJwksRoutes(key))
  await typed.register(buildAuthRoutes(authService), { prefix: '/auth' })

  return app
}
