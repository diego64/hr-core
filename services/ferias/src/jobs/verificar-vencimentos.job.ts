import type { FastifyBaseLogger } from 'fastify'
import type { Db } from 'mongodb'

import type { EventPublisher } from '../infrastructure/messaging/event-publisher.js'
import type { PeriodoAquisitivoRepository } from '../modules/repositories/periodo-aquisitivo.repository.js'
import { acquireJobLock } from './lock.js'

/**
 * Job 1: verifica vencimentos do período aquisitivo.
 *   - Para aquisitivos com `dataFim <= hoje` e status `EM_CURSO`:
 *       promove para DISPONIVEL.
 *   - Para aquisitivos com `dataLimiteGozo < hoje` e status não-terminal:
 *       marca como VENCIDO + publica PeriodoVencido (infração trabalhista).
 *   - Para aquisitivos vencendo daqui a 30 dias:
 *       publica PeriodoVencendo (notificação ao RH).
 */
export interface VencimentosDeps {
  readonly db: Db
  readonly aquisitivoRepo: PeriodoAquisitivoRepository
  readonly events: EventPublisher
  readonly log: FastifyBaseLogger
}

export interface VencimentosResult {
  readonly promovidosParaDisponivel: number
  readonly vencidos: number
  readonly notificadosVencendo: number
}

export async function rodarVerificarVencimentos(
  deps: VencimentosDeps,
  hoje: Date = new Date(),
): Promise<VencimentosResult | null> {
  const lock = await acquireJobLock(deps.db, 'verificar-vencimentos')
  if (!lock) {
    deps.log.info('job.verificar-vencimentos.skip — lock detido por outro processo')
    return null
  }

  try {
    // 1. EM_CURSO → DISPONIVEL
    const aPromover = await deps.aquisitivoRepo.listarParaPromoverDisponivel(hoje)
    let promovidosParaDisponivel = 0
    for (const p of aPromover) {
      const ok = await deps.aquisitivoRepo.atualizarStatus(p._id, 'EM_CURSO', 'DISPONIVEL')
      if (ok) promovidosParaDisponivel++
    }

    // 2. Vencidos
    const vencidosLista = await deps.aquisitivoRepo.listarVencidos(hoje)
    let vencidos = 0
    for (const p of vencidosLista) {
      const ok = await deps.aquisitivoRepo.atualizarStatus(p._id, p.status, 'VENCIDO')
      if (!ok) continue
      vencidos++
      await deps.events.publish({
        eventType: 'PeriodoVencido',
        aggregateId: p.funcionarioId,
        payload: {
          periodoAquisitivoId: p._id.toHexString(),
          dataLimiteGozo: p.dataLimiteGozo.toISOString(),
          diasNaoGozados: p.saldoDias,
        },
      })
    }

    // 3. Notificação 30 dias antes
    const vencendo = await deps.aquisitivoRepo.listarVencendoEm(hoje, 30)
    for (const p of vencendo) {
      await deps.events.publish({
        eventType: 'PeriodoVencendo',
        aggregateId: p.funcionarioId,
        payload: {
          periodoAquisitivoId: p._id.toHexString(),
          dataLimiteGozo: p.dataLimiteGozo.toISOString(),
          saldoDias: p.saldoDias,
          diasParaVencer: 30,
        },
      })
    }

    const result: VencimentosResult = {
      promovidosParaDisponivel,
      vencidos,
      notificadosVencendo: vencendo.length,
    }
    deps.log.info({ result }, 'job.verificar-vencimentos.done')
    return result
  } finally {
    await lock.release()
  }
}
