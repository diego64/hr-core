import { ObjectId, type Collection, type Db } from 'mongodb'

import type { AvaliadorDocument } from '../domain/entities/avaliador.js'

export interface CreateAvaliadorInput {
  readonly usuarioId: string
  readonly nome: string
  readonly email: string
  readonly setor: string
  readonly criadoPor: string
}

export class AvaliadorRepository {
  private readonly collection: Collection<AvaliadorDocument>

  constructor(db: Db) {
    this.collection = db.collection<AvaliadorDocument>('avaliadores')
    // Índice único para evitar duplicar avaliador para o mesmo usuário do auth.
    void this.collection.createIndex({ usuarioId: 1 }, { unique: true }).catch(() => undefined)
  }

  async findById(id: string): Promise<AvaliadorDocument | null> {
    if (!ObjectId.isValid(id)) return null
    return this.collection.findOne({ _id: new ObjectId(id) })
  }

  async findByUsuarioId(usuarioId: string): Promise<AvaliadorDocument | null> {
    return this.collection.findOne({ usuarioId })
  }

  async list(filtros: { setor?: string; ativo?: boolean }): Promise<AvaliadorDocument[]> {
    const query: Record<string, unknown> = {}
    if (filtros.setor !== undefined) query.setor = filtros.setor
    if (filtros.ativo !== undefined) query.ativo = filtros.ativo
    return this.collection.find(query).sort({ createdAt: -1 }).toArray()
  }

  async create(input: CreateAvaliadorInput): Promise<AvaliadorDocument> {
    const now = new Date()
    const doc: AvaliadorDocument = {
      _id: new ObjectId(),
      usuarioId: input.usuarioId,
      nome: input.nome,
      email: input.email,
      setor: input.setor,
      ativo: true,
      criadoPor: input.criadoPor,
      createdAt: now,
      updatedAt: now,
    }
    await this.collection.insertOne(doc)
    return doc
  }

  async desativar(id: string): Promise<AvaliadorDocument | null> {
    if (!ObjectId.isValid(id)) return null
    const result = await this.collection.findOneAndUpdate(
      { _id: new ObjectId(id) },
      { $set: { ativo: false, updatedAt: new Date() } },
      { returnDocument: 'after' },
    )
    return result
  }
}
