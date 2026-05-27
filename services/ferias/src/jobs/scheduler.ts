import type { FastifyBaseLogger } from 'fastify'
import type { Db } from 'mongodb'

import { env } from '../config/env.js'
import type { EventPublisher } from '../infrastructure/messaging/event-publisher.js'
import type { PeriodoAquisitivoRepository } from '../modules/repositories/periodo-aquisitivo.repository.js'
import type { PeriodoGozoService } from '../modules/services/periodo-gozo.service.js'
import { rodarConcluirGozos } from './concluir-gozos.job.js'
import { rodarIniciarGozos } from './iniciar-gozos.job.js'
import { rodarVerificarVencimentos } from './verificar-vencimentos.job.js'

/**
 * Scheduler in-process baseado em `setInterval`. Suficiente pra V1
 * (deploy single-instance) — quando subir a múltiplas réplicas, o lock
 * cooperativo na collection `jobs_locks` garante que só uma instância roda
 * cada job por vez. Pra multi-region, trocar por agenda externa (cron k8s
 * ou Temporal).
 *
 * Os 3 jobs rodam em sequência no mesmo intervalo:
 *   1. verificarVencimentos  (promove EM_CURSO→DISPONIVEL + marca VENCIDO)
 *   2. iniciarGozosDoDia     (AGENDADO → EM_GOZO)
 *   3. concluirGozosDoDia    (EM_GOZO → CONCLUIDO + novo aquisitivo)
 */
export interface SchedulerDeps {
  readonly db: Db
  readonly aquisitivoRepo: PeriodoAquisitivoRepository
  readonly gozoService: PeriodoGozoService
  readonly events: EventPublisher
  readonly log: FastifyBaseLogger
}

export interface SchedulerHandle {
  stop(): void
}

export function startScheduler(deps: SchedulerDeps): SchedulerHandle {
  if (!env.JOBS_ENABLED) {
    deps.log.info('scheduler.disabled — JOBS_ENABLED=false')
    return { stop: () => undefined }
  }

  const intervalMs = env.JOBS_INTERVAL_SECONDS * 1000
  const initialDelayMs = env.JOBS_INITIAL_DELAY_SECONDS * 1000

  const runCycle = async (): Promise<void> => {
    const hoje = new Date()
    try {
      await rodarVerificarVencimentos(
        {
          db: deps.db,
          aquisitivoRepo: deps.aquisitivoRepo,
          events: deps.events,
          log: deps.log,
        },
        hoje,
      )
      await rodarIniciarGozos({ db: deps.db, gozoService: deps.gozoService, log: deps.log }, hoje)
      await rodarConcluirGozos({ db: deps.db, gozoService: deps.gozoService, log: deps.log }, hoje)
    } catch (err) {
      deps.log.error({ err }, 'scheduler.cycle.error')
    }
  }

  // Espera initial delay pra não rodar exatamente no boot
  // (quando o serviço pode ainda estar drenando conexões).
  const initialTimer = setTimeout(() => {
    void runCycle()
  }, initialDelayMs)

  const interval = setInterval(() => {
    void runCycle()
  }, intervalMs)

  deps.log.info(
    {
      intervalSeconds: env.JOBS_INTERVAL_SECONDS,
      initialDelaySeconds: env.JOBS_INITIAL_DELAY_SECONDS,
    },
    'scheduler.started',
  )

  return {
    stop: () => {
      clearTimeout(initialTimer)
      clearInterval(interval)
    },
  }
}
