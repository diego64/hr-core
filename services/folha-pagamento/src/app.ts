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
import {
  LogEventPublisher,
  type EventPublisher,
} from './infrastructure/messaging/event-publisher.js'
import authPlugin from './middlewares/auth.js'
import corsPlugin from './middlewares/cors.js'
import { registerErrorHandler } from './middlewares/error-handler.js'
import metricsPlugin from './middlewares/metrics.js'
import swaggerPlugin from './middlewares/swagger.js'
import { buildFolhaRoutes } from './modules/controllers/folha.controller.js'
import { healthRoutes } from './modules/controllers/health.controller.js'
import { AuditoriaRepository } from './modules/repositories/auditoria.repository.js'
import { ContadorRepository } from './modules/repositories/contador.repository.js'
import { FolhaRepository } from './modules/repositories/folha.repository.js'
import { FuncionarioCacheRepository } from './modules/repositories/funcionario-cache.repository.js'
import { AuditoriaService } from './modules/services/auditoria.service.js'
import { FolhaService } from './modules/services/folha.service.js'

export interface BuildAppDeps {
  readonly db: Db
  /**
   * Injeção opcional do publisher de eventos. Em testes, passamos um
   * `InMemoryEventPublisher` pra inspecionar eventos sem mockar logger.
   * Em produção o default `LogEventPublisher` loga JSON estruturado até
   * Kafka entrar no projeto.
   */
  readonly events?: EventPublisher
}

export interface AppContext {
  readonly folhaService: FolhaService
  readonly auditoriaService: AuditoriaService
  readonly funcionarioRepo: FuncionarioCacheRepository
  readonly events: EventPublisher
}

// Re-exporta tipo de deps do AppContext para o server.ts wirear consumer
// Kafka opcional após buildApp().
export type { FuncionarioCacheRepository } from './modules/repositories/funcionario-cache.repository.js'

export async function buildApp(deps: BuildAppDeps): Promise<FastifyInstance & { ctx: AppContext }> {
  const useTransport = env.NODE_ENV === 'development'

  const app = Fastify({
    logger: {
      level: env.LOG_LEVEL,
      ...(useTransport
        ? { transport: { target: 'pino-pretty', options: { translateTime: 'SYS:standard' } } }
        : {}),
      base: { service: 'folha-pagamento' },
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
  await typed.register(authPlugin)
  await typed.register(swaggerPlugin)

  // Wiring DDD: repositórios → services. O event publisher é injetável pra
  // facilitar substituição por KafkaPublisher (futuro) e mocking em testes.
  const events: EventPublisher = deps.events ?? new LogEventPublisher(app.log)

  const folhaRepo = new FolhaRepository(deps.db)
  const funcionarioRepo = new FuncionarioCacheRepository(deps.db)
  const contadorRepo = new ContadorRepository(deps.db)
  const auditoriaRepo = new AuditoriaRepository(deps.db)

  const auditoriaService = new AuditoriaService(auditoriaRepo)
  const folhaService = new FolhaService(
    folhaRepo,
    funcionarioRepo,
    contadorRepo,
    auditoriaService,
    events,
  )

  await typed.register(healthRoutes)
  await typed.register(buildFolhaRoutes(folhaService))

  const ctx: AppContext = {
    folhaService,
    auditoriaService,
    funcionarioRepo,
    events,
  }

  // Expor ctx pro server.ts e pra testes.
  const decorated = Object.assign(typed, { ctx })
  return decorated
}
