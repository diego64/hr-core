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
import { buildPeriodoAquisitivoRoutes } from './modules/controllers/periodo-aquisitivo.controller.js'
import { buildPeriodoGozoRoutes } from './modules/controllers/periodo-gozo.controller.js'
import { buildSolicitacaoFeriasRoutes } from './modules/controllers/solicitacao-ferias.controller.js'
import { healthRoutes } from './modules/controllers/health.controller.js'
import { AuditoriaRepository } from './modules/repositories/auditoria.repository.js'
import { ContadorRepository } from './modules/repositories/contador.repository.js'
import { PeriodoAquisitivoRepository } from './modules/repositories/periodo-aquisitivo.repository.js'
import { PeriodoGozoRepository } from './modules/repositories/periodo-gozo.repository.js'
import { SolicitacaoFeriasRepository } from './modules/repositories/solicitacao-ferias.repository.js'
import { AuditoriaService } from './modules/services/auditoria.service.js'
import { PeriodoAquisitivoService } from './modules/services/periodo-aquisitivo.service.js'
import { PeriodoGozoService } from './modules/services/periodo-gozo.service.js'
import { SolicitacaoFeriasService } from './modules/services/solicitacao-ferias.service.js'

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
  readonly periodoAquisitivoService: PeriodoAquisitivoService
  readonly solicitacaoService: SolicitacaoFeriasService
  readonly periodoGozoService: PeriodoGozoService
  readonly auditoriaService: AuditoriaService
  readonly periodoAquisitivoRepo: PeriodoAquisitivoRepository
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
      base: { service: 'ferias' },
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

  const periodoAquisitivoRepo = new PeriodoAquisitivoRepository(deps.db)
  const solicitacaoRepo = new SolicitacaoFeriasRepository(deps.db)
  const periodoGozoRepo = new PeriodoGozoRepository(deps.db)
  const contadorRepo = new ContadorRepository(deps.db)
  const auditoriaRepo = new AuditoriaRepository(deps.db)

  const auditoriaService = new AuditoriaService(auditoriaRepo)
  const periodoAquisitivoService = new PeriodoAquisitivoService(periodoAquisitivoRepo, events)
  const periodoGozoService = new PeriodoGozoService(
    periodoGozoRepo,
    periodoAquisitivoRepo,
    auditoriaService,
    events,
  )
  const solicitacaoService = new SolicitacaoFeriasService(
    solicitacaoRepo,
    periodoAquisitivoRepo,
    periodoGozoRepo,
    contadorRepo,
    periodoAquisitivoService,
    auditoriaService,
    events,
  )

  await typed.register(healthRoutes)
  await typed.register(buildPeriodoAquisitivoRoutes(periodoAquisitivoService))
  await typed.register(buildSolicitacaoFeriasRoutes(solicitacaoService))
  await typed.register(buildPeriodoGozoRoutes(periodoGozoService))

  const ctx: AppContext = {
    periodoAquisitivoService,
    solicitacaoService,
    periodoGozoService,
    auditoriaService,
    periodoAquisitivoRepo,
    events,
  }

  // Expor ctx pro server.ts (jobs) e pra testes.
  const decorated = Object.assign(typed, { ctx })
  return decorated
}
