import type { FastifyBaseLogger } from 'fastify'
import type { Db } from 'mongodb'

import type { PeriodoGozoService } from '../modules/services/periodo-gozo.service.js'
import { acquireJobLock } from './lock.js'

export interface ConcluirGozosDeps {
  readonly db: Db
  readonly gozoService: PeriodoGozoService
  readonly log: FastifyBaseLogger
}

/**
 * Job 3: concluirGozosDoDia — EM_GOZO → CONCLUIDO + cria novo PeriodoAquisitivo
 * quando o aquisitivo do gozo ficou ENCERRADO. Idempotente.
 */
export async function rodarConcluirGozos(
  deps: ConcluirGozosDeps,
  hoje: Date = new Date(),
): Promise<number | null> {
  const lock = await acquireJobLock(deps.db, 'concluir-gozos')
  if (!lock) {
    deps.log.info('job.concluir-gozos.skip — lock detido por outro processo')
    return null
  }
  try {
    const count = await deps.gozoService.concluirGozosDoDia(hoje)
    deps.log.info({ concluidos: count }, 'job.concluir-gozos.done')
    return count
  } finally {
    await lock.release()
  }
}
