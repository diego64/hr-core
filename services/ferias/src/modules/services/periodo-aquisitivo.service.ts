import { PeriodoAquisitivoNaoEncontradoError } from '../domain/errors/domain-error.js'
import {
  toPublicPeriodoAquisitivo,
  type PublicPeriodoAquisitivo,
} from '../domain/entities/periodo-aquisitivo.js'
import { Cpf } from '../domain/value-objects/cpf.js'
import { gerarCodigoFuncionario } from '../domain/value-objects/codigo-funcionario.js'
import type { PeriodoAquisitivo } from '../domain/entities/periodo-aquisitivo.js'
import type { EventPublisher } from '../../infrastructure/messaging/event-publisher.js'
import type { PeriodoAquisitivoRepository } from '../repositories/periodo-aquisitivo.repository.js'

export interface IniciarPeriodoInput {
  readonly funcionarioId: string
  readonly cpf: string
  readonly dataInicio: Date
}

/**
 * Casos de uso do período aquisitivo. `iniciar` será disparado pelo consumer
 * Kafka quando o ms-funcionario publicar `FuncionarioCriado`. Enquanto Kafka
 * não sobe, esse método é chamado por endpoint admin (POST /admin/iniciar-periodo).
 */
export class PeriodoAquisitivoService {
  constructor(
    private readonly repo: PeriodoAquisitivoRepository,
    private readonly events: EventPublisher,
  ) {}

  async iniciar(input: IniciarPeriodoInput): Promise<PublicPeriodoAquisitivo> {
    const cpf = Cpf.parse(input.cpf)
    const codigoFun = gerarCodigoFuncionario(cpf)

    const created = await this.repo.create({
      funcionarioId: input.funcionarioId,
      codigoFun,
      dataInicio: input.dataInicio,
    })

    await this.events.publish({
      eventType: 'NovoPeriodoAquisitivo',
      aggregateId: input.funcionarioId,
      payload: {
        periodoAquisitivoId: created._id.toHexString(),
        codigoFun,
        dataInicio: created.dataInicio.toISOString(),
        dataFim: created.dataFim.toISOString(),
        dataLimiteGozo: created.dataLimiteGozo.toISOString(),
        diasDevidos: created.diasDevidos,
      },
    })

    return toPublicPeriodoAquisitivo(created)
  }

  async buscarVigente(funcionarioId: string): Promise<PublicPeriodoAquisitivo> {
    const found = await this.repo.findVigentePorFuncionario(funcionarioId)
    if (!found) throw new PeriodoAquisitivoNaoEncontradoError(funcionarioId)
    return toPublicPeriodoAquisitivo(found)
  }

  async listarHistorico(funcionarioId: string): Promise<PublicPeriodoAquisitivo[]> {
    const items = await this.repo.listPorFuncionario(funcionarioId)
    return items.map(toPublicPeriodoAquisitivo)
  }

  /**
   * Usado internamente pelo SolicitacaoFeriasService — retorna a entidade
   * crua sem mapeamento público (precisa do ObjectId).
   */
  async carregarVigenteRaw(funcionarioId: string): Promise<PeriodoAquisitivo> {
    const found = await this.repo.findVigentePorFuncionario(funcionarioId)
    if (!found) throw new PeriodoAquisitivoNaoEncontradoError(funcionarioId)
    return found
  }
}
