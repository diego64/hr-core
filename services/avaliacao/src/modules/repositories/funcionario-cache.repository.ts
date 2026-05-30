import type { Collection, Db } from 'mongodb'

import type { FuncionarioCacheDocument } from '../domain/entities/funcionario-cache.js'

export interface UpsertFuncionarioCacheInput {
  readonly _id: string
  readonly codigoFun: string
  readonly nome: string
  readonly setor: string
  readonly ativo: boolean
}

/**
 * Cache local de funcionários sincronizado via eventos Kafka do ms-funcionario.
 * Sem Kafka real ainda — o seed popula manualmente e o ms-avaliacao consulta
 * deste cache para validar o setor antes de criar avaliação.
 */
export class FuncionarioCacheRepository {
  private readonly collection: Collection<FuncionarioCacheDocument>

  constructor(db: Db) {
    this.collection = db.collection<FuncionarioCacheDocument>('funcionarios_cache')
    void this.collection.createIndex({ codigoFun: 1 }, { unique: true }).catch(() => undefined)
    void this.collection.createIndex({ setor: 1 }).catch(() => undefined)
  }

  async findById(funcionarioId: string): Promise<FuncionarioCacheDocument | null> {
    return this.collection.findOne({ _id: funcionarioId })
  }

  async findByCodigoFun(codigoFun: string): Promise<FuncionarioCacheDocument | null> {
    return this.collection.findOne({ codigoFun })
  }

  async upsert(input: UpsertFuncionarioCacheInput): Promise<FuncionarioCacheDocument> {
    const now = new Date()
    const doc: FuncionarioCacheDocument = {
      _id: input._id,
      codigoFun: input.codigoFun,
      nome: input.nome,
      setor: input.setor,
      ativo: input.ativo,
      updatedAt: now,
    }
    await this.collection.replaceOne({ _id: input._id }, doc, { upsert: true })
    return doc
  }

  async marcarInativo(funcionarioId: string): Promise<void> {
    await this.collection.updateOne(
      { _id: funcionarioId },
      { $set: { ativo: false, updatedAt: new Date() } },
    )
  }
}
