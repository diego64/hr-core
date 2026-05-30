import { ObjectId, type Collection, type Db } from 'mongodb'

import type { AvaliacaoDocument } from '../domain/entities/avaliacao.js'
import type { NotaValor } from '../domain/value-objects/nota.js'

export interface CreateAvaliacaoInput {
  readonly codigo: string
  readonly codigoFun: string
  readonly funcionarioId: string
  readonly avaliadorId: string
  readonly setor: string
  readonly titulo: string
  readonly comentario: string
  readonly nota: NotaValor
}

export interface UpdateAvaliacaoInput {
  readonly titulo?: string
  readonly comentario?: string
  readonly nota?: NotaValor
}

export interface ListarAvaliacoesFiltros {
  readonly codigoFun?: string
  readonly avaliadorId?: string
  readonly setor?: string
}

export interface ListarAvaliacoesResult {
  readonly items: AvaliacaoDocument[]
  readonly total: number
  readonly page: number
  readonly limit: number
  readonly pages: number
}

export class AvaliacaoRepository {
  private readonly collection: Collection<AvaliacaoDocument>

  constructor(db: Db) {
    this.collection = db.collection<AvaliacaoDocument>('avaliacoes')
    void this.collection.createIndex({ codigo: 1 }, { unique: true }).catch(() => undefined)
    void this.collection.createIndex({ codigoFun: 1, createdAt: -1 }).catch(() => undefined)
    void this.collection.createIndex({ avaliadorId: 1, createdAt: -1 }).catch(() => undefined)
    void this.collection.createIndex({ setor: 1, createdAt: -1 }).catch(() => undefined)
  }

  async findById(id: string): Promise<AvaliacaoDocument | null> {
    if (!ObjectId.isValid(id)) return null
    return this.collection.findOne({ _id: new ObjectId(id) })
  }

  async findByCodigo(codigo: string): Promise<AvaliacaoDocument | null> {
    return this.collection.findOne({ codigo })
  }

  async listar(
    filtros: ListarAvaliacoesFiltros,
    page: number,
    limit: number,
  ): Promise<ListarAvaliacoesResult> {
    const query: Record<string, unknown> = {}
    if (filtros.codigoFun !== undefined) query.codigoFun = filtros.codigoFun
    if (filtros.avaliadorId !== undefined) query.avaliadorId = filtros.avaliadorId
    if (filtros.setor !== undefined) query.setor = filtros.setor

    const skip = (page - 1) * limit
    const [items, total] = await Promise.all([
      this.collection.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit).toArray(),
      this.collection.countDocuments(query),
    ])
    const pages = Math.max(1, Math.ceil(total / limit))
    return { items, total, page, limit, pages }
  }

  async create(input: CreateAvaliacaoInput): Promise<AvaliacaoDocument> {
    const now = new Date()
    const doc: AvaliacaoDocument = {
      _id: new ObjectId(),
      codigo: input.codigo,
      codigoFun: input.codigoFun,
      funcionarioId: input.funcionarioId,
      avaliadorId: input.avaliadorId,
      setor: input.setor,
      titulo: input.titulo,
      comentario: input.comentario,
      nota: input.nota,
      createdAt: now,
      updatedAt: now,
    }
    await this.collection.insertOne(doc)
    return doc
  }

  async update(id: string, input: UpdateAvaliacaoInput): Promise<AvaliacaoDocument | null> {
    if (!ObjectId.isValid(id)) return null
    const set: Record<string, unknown> = { updatedAt: new Date() }
    if (input.titulo !== undefined) set.titulo = input.titulo
    if (input.comentario !== undefined) set.comentario = input.comentario
    if (input.nota !== undefined) set.nota = input.nota
    return this.collection.findOneAndUpdate(
      { _id: new ObjectId(id) },
      { $set: set },
      { returnDocument: 'after' },
    )
  }
}
