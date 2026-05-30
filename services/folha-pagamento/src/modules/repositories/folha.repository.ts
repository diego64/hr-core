import { MongoServerError, ObjectId, type Collection, type Db } from 'mongodb'

import type { CreateFolhaInput, Folha, ItemFolha } from '../domain/entities/folha.js'
import { FolhaCompetenciaDuplicadaError } from '../domain/errors/domain-error.js'
import type { StatusFolha } from '../domain/value-objects/status-folha.js'
import type { TipoFolha } from '../domain/value-objects/tipo-folha.js'

export interface ListFolhasFilter {
  readonly status?: StatusFolha
  readonly tipo?: TipoFolha
  readonly funcionarioId?: string
  readonly codigoFun?: string
  readonly competencia?: string
}

export interface ListFolhasPage {
  readonly items: Folha[]
  readonly total: number
  readonly page: number
  readonly limit: number
  readonly pages: number
}

export interface AtualizarCalculoInput {
  readonly proventos: readonly ItemFolha[]
  readonly descontos: readonly ItemFolha[]
  readonly totalProventos: number
  readonly totalDescontos: number
  readonly salarioLiquido: number
  readonly descontoINSS: number
  readonly descontoIRRF: number
  readonly fgts: number
  readonly processadaPor: string
}

const DUPLICATE_KEY_ERROR_CODE = 11_000

export class FolhaRepository {
  private readonly collection: Collection<Folha>

  constructor(db: Db) {
    this.collection = db.collection<Folha>('folhas')
  }

  async create(input: CreateFolhaInput): Promise<Folha> {
    const now = new Date()
    const doc: Folha = {
      _id: new ObjectId(),
      codigo: input.codigo,
      codigoFun: input.codigoFun,
      funcionarioId: input.funcionarioId,
      tipo: input.tipo,
      competencia: input.competencia,
      salarioBase: input.salarioBase,
      numeroDependentes: input.numeroDependentes,
      proventos: input.proventos ?? [],
      descontos: input.descontos ?? [],
      totalProventos: 0,
      totalDescontos: 0,
      salarioLiquido: 0,
      fgts: 0,
      descontoINSS: 0,
      descontoIRRF: 0,
      status: input.statusInicial ?? 'ABERTA',
      processadaPor: null,
      processadaEm: null,
      aprovadaPor: null,
      aprovadaEm: null,
      justificativaRejeicao: null,
      pagaPor: null,
      pagaEm: null,
      fechadaPor: null,
      fechadaEm: null,
      periodoGozoId: input.periodoGozoId ?? null,
      abertaPor: input.abertaPor,
      createdAt: now,
      updatedAt: now,
    }

    try {
      await this.collection.insertOne(doc)
    } catch (cause) {
      if (cause instanceof MongoServerError && cause.code === DUPLICATE_KEY_ERROR_CODE) {
        throw new FolhaCompetenciaDuplicadaError(input.codigoFun, input.tipo, input.competencia)
      }
      throw cause
    }
    return doc
  }

  async findById(id: string | ObjectId): Promise<Folha | null> {
    const oid = typeof id === 'string' ? new ObjectId(id) : id
    return this.collection.findOne({ _id: oid })
  }

  async findByCodigo(codigo: string): Promise<Folha | null> {
    return this.collection.findOne({ codigo })
  }

  async findByFuncionarioCompetencia(
    codigoFun: string,
    tipo: TipoFolha,
    competencia: string,
  ): Promise<Folha | null> {
    return this.collection.findOne({ codigoFun, tipo, competencia })
  }

  async list(filter: ListFolhasFilter, page: number, limit: number): Promise<ListFolhasPage> {
    const query: Record<string, unknown> = {}
    if (filter.status) query.status = filter.status
    if (filter.tipo) query.tipo = filter.tipo
    if (filter.funcionarioId) query.funcionarioId = filter.funcionarioId
    if (filter.codigoFun) query.codigoFun = filter.codigoFun
    if (filter.competencia) query.competencia = filter.competencia

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

  async setProventosDescontos(
    id: string | ObjectId,
    statusEsperado: StatusFolha,
    proventos: readonly ItemFolha[],
    descontos: readonly ItemFolha[],
  ): Promise<boolean> {
    const oid = typeof id === 'string' ? new ObjectId(id) : id
    const result = await this.collection.updateOne(
      { _id: oid, status: statusEsperado },
      {
        $set: {
          proventos: [...proventos],
          descontos: [...descontos],
          updatedAt: new Date(),
        },
      },
    )
    return result.modifiedCount === 1
  }

  async processar(id: string | ObjectId, input: AtualizarCalculoInput): Promise<boolean> {
    const oid = typeof id === 'string' ? new ObjectId(id) : id
    const now = new Date()
    const result = await this.collection.updateOne(
      { _id: oid, status: { $in: ['ABERTA', 'PROCESSADA'] } },
      {
        $set: {
          proventos: [...input.proventos],
          descontos: [...input.descontos],
          totalProventos: input.totalProventos,
          totalDescontos: input.totalDescontos,
          salarioLiquido: input.salarioLiquido,
          descontoINSS: input.descontoINSS,
          descontoIRRF: input.descontoIRRF,
          fgts: input.fgts,
          status: 'PROCESSADA',
          processadaPor: input.processadaPor,
          processadaEm: now,
          justificativaRejeicao: null,
          updatedAt: now,
        },
      },
    )
    return result.modifiedCount === 1
  }

  async aprovar(id: string | ObjectId, aprovadaPor: string): Promise<boolean> {
    const oid = typeof id === 'string' ? new ObjectId(id) : id
    const now = new Date()
    const result = await this.collection.updateOne(
      { _id: oid, status: 'PROCESSADA' },
      {
        $set: {
          status: 'APROVADA',
          aprovadaPor,
          aprovadaEm: now,
          updatedAt: now,
        },
      },
    )
    return result.modifiedCount === 1
  }

  async rejeitar(
    id: string | ObjectId,
    rejeitadaPor: string,
    justificativa: string,
  ): Promise<boolean> {
    const oid = typeof id === 'string' ? new ObjectId(id) : id
    const now = new Date()
    const result = await this.collection.updateOne(
      { _id: oid, status: 'PROCESSADA' },
      {
        $set: {
          status: 'REJEITADA',
          aprovadaPor: rejeitadaPor,
          aprovadaEm: now,
          justificativaRejeicao: justificativa,
          updatedAt: now,
        },
      },
    )
    return result.modifiedCount === 1
  }

  async reabrir(id: string | ObjectId): Promise<boolean> {
    const oid = typeof id === 'string' ? new ObjectId(id) : id
    const now = new Date()
    const result = await this.collection.updateOne(
      { _id: oid, status: 'REJEITADA' },
      {
        $set: {
          status: 'ABERTA',
          updatedAt: now,
        },
      },
    )
    return result.modifiedCount === 1
  }

  async confirmarPagamento(id: string | ObjectId, pagaPor: string): Promise<boolean> {
    const oid = typeof id === 'string' ? new ObjectId(id) : id
    const now = new Date()
    const result = await this.collection.updateOne(
      { _id: oid, status: 'APROVADA' },
      {
        $set: {
          status: 'PAGA',
          pagaPor,
          pagaEm: now,
          updatedAt: now,
        },
      },
    )
    return result.modifiedCount === 1
  }

  async fechar(id: string | ObjectId, fechadaPor: string): Promise<boolean> {
    const oid = typeof id === 'string' ? new ObjectId(id) : id
    const now = new Date()
    const result = await this.collection.updateOne(
      { _id: oid, status: 'PAGA' },
      {
        $set: {
          status: 'FECHADA',
          fechadaPor,
          fechadaEm: now,
          updatedAt: now,
        },
      },
    )
    return result.modifiedCount === 1
  }
}
