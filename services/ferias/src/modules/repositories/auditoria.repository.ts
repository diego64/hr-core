import { ObjectId, type Collection, type Db } from 'mongodb'

import type { Auditoria, CreateAuditoriaInput } from '../domain/entities/auditoria.js'

export class AuditoriaRepository {
  private readonly collection: Collection<Auditoria>

  constructor(db: Db) {
    this.collection = db.collection<Auditoria>('auditoria')
  }

  async create(input: CreateAuditoriaInput): Promise<Auditoria> {
    const doc: Auditoria = {
      _id: new ObjectId(),
      usuarioId: input.usuarioId,
      acao: input.acao,
      recurso: input.recurso,
      recursoId: input.recursoId,
      valorAnterior: input.valorAnterior ?? null,
      valorNovo: input.valorNovo ?? null,
      ip: input.ip ?? null,
      userAgent: input.userAgent ?? null,
      createdAt: new Date(),
    }
    await this.collection.insertOne(doc)
    return doc
  }

  async listPorRecurso(recurso: string, recursoId: string, limit = 50): Promise<Auditoria[]> {
    return this.collection
      .find({ recurso, recursoId })
      .sort({ createdAt: -1 })
      .limit(limit)
      .toArray()
  }
}
