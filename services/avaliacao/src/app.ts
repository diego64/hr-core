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
import { buildAvaliacaoRoutes } from './modules/controllers/avaliacao.controller.js'
import { buildAvaliadorRoutes } from './modules/controllers/avaliador.controller.js'
import { healthRoutes } from './modules/controllers/health.controller.js'
import { AuditoriaRepository } from './modules/repositories/auditoria.repository.js'
import { AvaliacaoRepository } from './modules/repositories/avaliacao.repository.js'
import { AvaliadorRepository } from './modules/repositories/avaliador.repository.js'
import { ContadorRepository } from './modules/repositories/contador.repository.js'
import { FuncionarioCacheRepository } from './modules/repositories/funcionario-cache.repository.js'
import { AuditoriaService } from './modules/services/auditoria.service.js'
import { AvaliacaoService } from './modules/services/avaliacao.service.js'
import { AvaliadorService } from './modules/services/avaliador.service.js'

export interface BuildAppDeps {
  readonly db: Db
  /**
   * Publisher de eventos injetável. Default = `LogEventPublisher` (placeholder
   * até Kafka entrar). Testes passam um `InMemoryEventPublisher`.
   */
  readonly events?: EventPublisher
}

export interface AppContext {
  readonly avaliadorService: AvaliadorService
  readonly avaliacaoService: AvaliacaoService
  readonly auditoriaService: AuditoriaService
  readonly funcionarioCacheRepo: FuncionarioCacheRepository
  readonly avaliadorRepo: AvaliadorRepository
  readonly events: EventPublisher
}

export async function buildApp(deps: BuildAppDeps): Promise<FastifyInstance & { ctx: AppContext }> {
  const useTransport = env.NODE_ENV === 'development'

  const app = Fastify({
    logger: {
      level: env.LOG_LEVEL,
      ...(useTransport
        ? { transport: { target: 'pino-pretty', options: { translateTime: 'SYS:standard' } } }
        : {}),
      base: { service: 'avaliacao' },
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

  const events: EventPublisher = deps.events ?? new LogEventPublisher(app.log)

  const auditoriaRepo = new AuditoriaRepository(deps.db)
  const avaliadorRepo = new AvaliadorRepository(deps.db)
  const avaliacaoRepo = new AvaliacaoRepository(deps.db)
  const contadorRepo = new ContadorRepository(deps.db)
  const funcionarioCacheRepo = new FuncionarioCacheRepository(deps.db)

  const auditoriaService = new AuditoriaService(auditoriaRepo)
  const avaliadorService = new AvaliadorService(avaliadorRepo, auditoriaService, events)
  const avaliacaoService = new AvaliacaoService(
    avaliacaoRepo,
    avaliadorRepo,
    funcionarioCacheRepo,
    contadorRepo,
    auditoriaService,
    events,
  )

  await typed.register(healthRoutes)
  await typed.register(buildAvaliadorRoutes(avaliadorService))
  await typed.register(buildAvaliacaoRoutes(avaliacaoService))

  const ctx: AppContext = {
    avaliadorService,
    avaliacaoService,
    auditoriaService,
    funcionarioCacheRepo,
    avaliadorRepo,
    events,
  }

  return Object.assign(typed, { ctx })
}
