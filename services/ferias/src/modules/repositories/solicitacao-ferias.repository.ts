import { ObjectId, type Collection, type Db } from 'mongodb'

import type {
  CreateSolicitacaoFeriasInput,
  SolicitacaoFerias,
  SolicitacaoStatus,
} from '../domain/entities/solicitacao-ferias.js'

export interface ListSolicitacoesFilter {
  readonly status?: SolicitacaoStatus
  readonly funcionarioId?: string
  readonly periodoAquisitivoId?: string | ObjectId
}

export interface ListSolicitacoesPage {
  readonly items: SolicitacaoFerias[]
  readonly total: number
  readonly page: number
  readonly limit: number
  readonly pages: number
}

export class SolicitacaoFeriasRepository {
  private readonly collection: Collection<SolicitacaoFerias>

  constructor(db: Db) {
    this.collection = db.collection<SolicitacaoFerias>('solicitacoes_ferias')
  }

  async create(input: CreateSolicitacaoFeriasInput): Promise<SolicitacaoFerias> {
    const now = new Date()
    const document: SolicitacaoFerias = {
      _id: new ObjectId(),
      codigo: input.codigo,
      codigoFun: input.codigoFun,
      funcionarioId: input.funcionarioId,
      periodoAquisitivoId: input.periodoAquisitivoId,
      periodoGozoId: null,
      dataInicio: input.dataInicio,
      dataFim: input.dataFim,
      diasSolicitados: input.diasSolicitados,
      abonoPecuniario: input.abonoPecuniario,
      diasAbono: input.diasAbono,
      status: 'PENDENTE',
      justificativaRejeicao: null,
      motivoCancelamento: null,
      aprovadoPor: null,
      aprovadoEm: null,
      canceladoPor: null,
      canceladoEm: null,
      solicitadoPor: input.solicitadoPor,
      createdAt: now,
      updatedAt: now,
    }
    await this.collection.insertOne(document)
    return document
  }

  async findById(id: string | ObjectId): Promise<SolicitacaoFerias | null> {
    const oid = typeof id === 'string' ? new ObjectId(id) : id
    return this.collection.findOne({ _id: oid })
  }

  async findByCodigo(codigo: string): Promise<SolicitacaoFerias | null> {
    return this.collection.findOne({ codigo })
  }

  async list(
    filter: ListSolicitacoesFilter,
    page: number,
    limit: number,
  ): Promise<ListSolicitacoesPage> {
    const query: Record<string, unknown> = {}
    if (filter.status) query.status = filter.status
    if (filter.funcionarioId) query.funcionarioId = filter.funcionarioId
    if (filter.periodoAquisitivoId) {
      query.periodoAquisitivoId =
        typeof filter.periodoAquisitivoId === 'string'
          ? new ObjectId(filter.periodoAquisitivoId)
          : filter.periodoAquisitivoId
    }

    const skip = (page - 1) * limit
    const [items, total] = await Promise.all([
      this.collection.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit).toArray(),
      this.collection.countDocuments(query),
    ])
    return {
      items,
      total,
      page,
      limit,
      pages: Math.max(1, Math.ceil(total / limit)),
    }
  }

  async contarFracoesNoAquisitivo(periodoAquisitivoId: string | ObjectId): Promise<number> {
    const oid =
      typeof periodoAquisitivoId === 'string'
        ? new ObjectId(periodoAquisitivoId)
        : periodoAquisitivoId
    return this.collection.countDocuments({
      periodoAquisitivoId: oid,
      status: { $in: ['PENDENTE', 'APROVADA'] }, // canceladas/rejeitadas não contam
    })
  }

  async aprovar(
    id: string | ObjectId,
    aprovadoPor: string,
    periodoGozoId: ObjectId,
  ): Promise<boolean> {
    const oid = typeof id === 'string' ? new ObjectId(id) : id
    const now = new Date()
    const result = await this.collection.updateOne(
      { _id: oid, status: 'PENDENTE' },
      {
        $set: {
          status: 'APROVADA',
          aprovadoPor,
          aprovadoEm: now,
          periodoGozoId,
          updatedAt: now,
        },
      },
    )
    return result.modifiedCount === 1
  }

  async rejeitar(
    id: string | ObjectId,
    aprovadoPor: string,
    justificativa: string,
  ): Promise<boolean> {
    const oid = typeof id === 'string' ? new ObjectId(id) : id
    const now = new Date()
    const result = await this.collection.updateOne(
      { _id: oid, status: 'PENDENTE' },
      {
        $set: {
          status: 'REJEITADA',
          aprovadoPor,
          aprovadoEm: now,
          justificativaRejeicao: justificativa,
          updatedAt: now,
        },
      },
    )
    return result.modifiedCount === 1
  }

  async cancelar(
    id: string | ObjectId,
    canceladoPor: string,
    motivo: string,
    statusAceitos: readonly SolicitacaoStatus[],
  ): Promise<boolean> {
    const oid = typeof id === 'string' ? new ObjectId(id) : id
    const now = new Date()
    const result = await this.collection.updateOne(
      { _id: oid, status: { $in: [...statusAceitos] } },
      {
        $set: {
          status: 'CANCELADA',
          canceladoPor,
          canceladoEm: now,
          motivoCancelamento: motivo,
          updatedAt: now,
        },
      },
    )
    return result.modifiedCount === 1
  }
}
