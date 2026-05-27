import { ObjectId, type Collection, type Db } from 'mongodb'

import type {
  CreatePeriodoGozoInput,
  PeriodoGozo,
  PeriodoGozoStatus,
} from '../domain/entities/periodo-gozo.js'

export class PeriodoGozoRepository {
  private readonly collection: Collection<PeriodoGozo>

  constructor(db: Db) {
    this.collection = db.collection<PeriodoGozo>('periodos_gozo')
  }

  async create(input: CreatePeriodoGozoInput): Promise<PeriodoGozo> {
    const now = new Date()
    const document: PeriodoGozo = {
      _id: new ObjectId(),
      funcionarioId: input.funcionarioId,
      codigoFun: input.codigoFun,
      periodoAquisitivoId: input.periodoAquisitivoId,
      solicitacaoId: input.solicitacaoId,
      dataInicio: input.dataInicio,
      dataFim: input.dataFim,
      diasGozo: input.diasGozo,
      diasAbono: input.diasAbono,
      salarioBruto: input.salarioBruto,
      valorFerias: input.valorFerias,
      valorTerco: input.valorTerco,
      valorAbono: input.valorAbono,
      valorTotal: input.valorTotal,
      dataPagamento: null,
      status: 'AGENDADO',
      createdAt: now,
      updatedAt: now,
    }
    await this.collection.insertOne(document)
    return document
  }

  async findById(id: string | ObjectId): Promise<PeriodoGozo | null> {
    const oid = typeof id === 'string' ? new ObjectId(id) : id
    return this.collection.findOne({ _id: oid })
  }

  async listPorFuncionario(funcionarioId: string): Promise<PeriodoGozo[]> {
    return this.collection.find({ funcionarioId }).sort({ dataInicio: -1 }).toArray()
  }

  async atualizarStatus(
    id: string | ObjectId,
    from: PeriodoGozoStatus,
    to: PeriodoGozoStatus,
  ): Promise<boolean> {
    const oid = typeof id === 'string' ? new ObjectId(id) : id
    const result = await this.collection.updateOne(
      { _id: oid, status: from },
      { $set: { status: to, updatedAt: new Date() } },
    )
    return result.modifiedCount === 1
  }

  async marcarPago(id: string | ObjectId, dataPagamento: Date): Promise<boolean> {
    const oid = typeof id === 'string' ? new ObjectId(id) : id
    const result = await this.collection.updateOne(
      { _id: oid },
      { $set: { dataPagamento, updatedAt: new Date() } },
    )
    return result.matchedCount === 1
  }

  /**
   * Para job iniciarGozosDoDia: AGENDADO com dataInicio <= hoje.
   */
  async listarParaIniciar(hoje: Date): Promise<PeriodoGozo[]> {
    return this.collection.find({ status: 'AGENDADO', dataInicio: { $lte: hoje } }).toArray()
  }

  /**
   * Para job concluirGozosDoDia: EM_GOZO com dataFim < hoje.
   */
  async listarParaConcluir(hoje: Date): Promise<PeriodoGozo[]> {
    return this.collection.find({ status: 'EM_GOZO', dataFim: { $lt: hoje } }).toArray()
  }

  /**
   * Recalcula valores financeiros para gozos AGENDADO de um funcionário
   * (usado quando o consumer de SalarioAlterado chegar — hoje stub).
   */
  async recalcularValoresAgendados(
    funcionarioId: string,
    novoSalarioBruto: number,
    calcular: (input: { salarioBruto: number; diasGozo: number; diasAbono: number }) => {
      valorFerias: number
      valorTerco: number
      valorAbono: number
      valorTotal: number
    },
  ): Promise<number> {
    const agendados = await this.collection.find({ funcionarioId, status: 'AGENDADO' }).toArray()
    let atualizados = 0
    for (const g of agendados) {
      const novo = calcular({
        salarioBruto: novoSalarioBruto,
        diasGozo: g.diasGozo,
        diasAbono: g.diasAbono,
      })
      const r = await this.collection.updateOne(
        { _id: g._id, status: 'AGENDADO' },
        {
          $set: {
            salarioBruto: novoSalarioBruto,
            valorFerias: novo.valorFerias,
            valorTerco: novo.valorTerco,
            valorAbono: novo.valorAbono,
            valorTotal: novo.valorTotal,
            updatedAt: new Date(),
          },
        },
      )
      if (r.modifiedCount === 1) atualizados++
    }
    return atualizados
  }
}
