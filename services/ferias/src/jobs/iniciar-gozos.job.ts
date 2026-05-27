import type { FastifyBaseLogger } from 'fastify'
import type { Db } from 'mongodb'

import type { PeriodoGozoService } from '../modules/services/periodo-gozo.service.js'
import { acquireJobLock } from './lock.js'

export interface IniciarGozosDeps {
  readonly db: Db
  readonly gozoService: PeriodoGozoService
  readonly log: FastifyBaseLogger
}

/**
 * Job 2: iniciarGozosDoDia — AGENDADO → EM_GOZO para gozos com dataInicio<=hoje.
 * Idempotente (filtro de status no UPDATE).
 */
export async function rodarIniciarGozos(
  deps: IniciarGozosDeps,
  hoje: Date = new Date(),
): Promise<number | null> {
  const lock = await acquireJobLock(deps.db, 'iniciar-gozos')
  if (!lock) {
    deps.log.info('job.iniciar-gozos.skip — lock detido por outro processo')
    return null
  }
  try {
    const count = await deps.gozoService.iniciarGozosDoDia(hoje)
    deps.log.info({ iniciados: count }, 'job.iniciar-gozos.done')
    return count
  } finally {
    await lock.release()
  }
}
