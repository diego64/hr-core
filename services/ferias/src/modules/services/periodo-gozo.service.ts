import { ObjectId } from 'mongodb'

import { PeriodoGozoNaoEncontradoError } from '../domain/errors/domain-error.js'
import { toPublicPeriodoGozo, type PublicPeriodoGozo } from '../domain/entities/periodo-gozo.js'
import { CLT_CONSTANTES } from '../domain/clt-rules.js'
import { addMeses } from '../domain/entities/periodo-aquisitivo.js'
import { validarTransicaoGozo } from '../domain/workflow/transicao-gozo.js'
import type { EventPublisher } from '../../infrastructure/messaging/event-publisher.js'
import type { PeriodoAquisitivoRepository } from '../repositories/periodo-aquisitivo.repository.js'
import type { PeriodoGozoRepository } from '../repositories/periodo-gozo.repository.js'
import type { AuditoriaService } from './auditoria.service.js'

const RECURSO = 'periodos_gozo'

export class PeriodoGozoService {
  constructor(
    private readonly repo: PeriodoGozoRepository,
    private readonly aquisitivoRepo: PeriodoAquisitivoRepository,
    private readonly auditoria: AuditoriaService,
    private readonly events: EventPublisher,
  ) {}

  async buscarPorId(id: string): Promise<PublicPeriodoGozo> {
    const found = await this.repo.findById(id)
    if (!found) throw new PeriodoGozoNaoEncontradoError(id)
    return toPublicPeriodoGozo(found)
  }

  async listarPorFuncionario(funcionarioId: string): Promise<PublicPeriodoGozo[]> {
    const items = await this.repo.listPorFuncionario(funcionarioId)
    return items.map(toPublicPeriodoGozo)
  }

  /**
   * Job iniciarGozosDoDia — transita AGENDADO → EM_GOZO para todos os gozos
   * cuja dataInicio <= hoje. Idempotente: filtro `status: 'AGENDADO'` no UPDATE
   * impede re-iniciar gozos já em curso.
   */
  async iniciarGozosDoDia(hoje: Date = new Date()): Promise<number> {
    const gozos = await this.repo.listarParaIniciar(hoje)
    let iniciados = 0
    for (const g of gozos) {
      validarTransicaoGozo('AGENDADO', 'EM_GOZO')
      const ok = await this.repo.atualizarStatus(g._id, 'AGENDADO', 'EM_GOZO')
      if (!ok) continue
      iniciados++
      await this.auditoria.registrar({
        usuarioId: null,
        acao: 'GOZO_INICIADO',
        recurso: RECURSO,
        recursoId: g._id.toHexString(),
        valorAnterior: { status: 'AGENDADO' },
        valorNovo: { status: 'EM_GOZO' },
      })
      await this.events.publish({
        eventType: 'GozoIniciado',
        aggregateId: g.funcionarioId,
        payload: {
          periodoGozoId: g._id.toHexString(),
          dataInicio: g.dataInicio.toISOString(),
        },
      })
    }
    return iniciados
  }

  /**
   * Job concluirGozosDoDia — EM_GOZO → CONCLUIDO + dispara novo PeriodoAquisitivo
   * a partir do dia seguinte ao fim do gozo (CLT: novo ciclo inicia automaticamente).
   */
  async concluirGozosDoDia(hoje: Date = new Date()): Promise<number> {
    const gozos = await this.repo.listarParaConcluir(hoje)
    let concluidos = 0
    for (const g of gozos) {
      validarTransicaoGozo('EM_GOZO', 'CONCLUIDO')
      const ok = await this.repo.atualizarStatus(g._id, 'EM_GOZO', 'CONCLUIDO')
      if (!ok) continue
      concluidos++

      await this.auditoria.registrar({
        usuarioId: null,
        acao: 'GOZO_CONCLUIDO',
        recurso: RECURSO,
        recursoId: g._id.toHexString(),
        valorAnterior: { status: 'EM_GOZO' },
        valorNovo: { status: 'CONCLUIDO' },
      })
      await this.events.publish({
        eventType: 'GozoConcluido',
        aggregateId: g.funcionarioId,
        payload: {
          periodoGozoId: g._id.toHexString(),
          dataFim: g.dataFim.toISOString(),
        },
      })

      // Cria novo período aquisitivo se o aquisitivo origem está ENCERRADO
      // (caso contrário, ainda restam dias e o aquisitivo segue ativo).
      const aquisitivo = await this.aquisitivoRepo.findById(g.periodoAquisitivoId)
      if (aquisitivo && aquisitivo.status === 'ENCERRADO') {
        const novoInicio = new Date(g.dataFim.getTime() + 24 * 60 * 60 * 1000)
        const novo = await this.aquisitivoRepo.create({
          funcionarioId: g.funcionarioId,
          codigoFun: g.codigoFun,
          dataInicio: novoInicio,
        })
        await this.events.publish({
          eventType: 'NovoPeriodoAquisitivo',
          aggregateId: g.funcionarioId,
          payload: {
            periodoAquisitivoId: novo._id.toHexString(),
            dataInicio: novo.dataInicio.toISOString(),
            dataFim: novo.dataFim.toISOString(),
            dataLimiteGozo: novo.dataLimiteGozo.toISOString(),
          },
        })
      }
    }
    return concluidos
  }
}

// Export utilitário usado em testes
export { addMeses, CLT_CONSTANTES, ObjectId }
