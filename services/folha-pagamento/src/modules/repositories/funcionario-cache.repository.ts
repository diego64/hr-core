import { type Collection, type Db } from 'mongodb'

import type {
  FuncionarioCache,
  UpsertFuncionarioCacheInput,
} from '../domain/entities/funcionario-cache.js'

/**
 * Repositório do cache local de funcionários. Populado via consumidores Kafka
 * (`FuncionarioCriado`, `SalarioAlterado`, `DependenteAdicionado`,
 * `FuncionarioDesligado`) — quando Kafka entrar no projeto. Por enquanto
 * pode ser populado manualmente via fixture/seed em dev.
 */
export class FuncionarioCacheRepository {
  private readonly collection: Collection<FuncionarioCache>

  constructor(db: Db) {
    this.collection = db.collection<FuncionarioCache>('funcionarios_cache')
  }

  async findByCodigoFun(codigoFun: string): Promise<FuncionarioCache | null> {
    return this.collection.findOne({ codigoFun })
  }

  async findByFuncionarioId(funcionarioId: string): Promise<FuncionarioCache | null> {
    return this.collection.findOne({ _id: funcionarioId })
  }

  async upsert(input: UpsertFuncionarioCacheInput): Promise<FuncionarioCache> {
    const now = new Date()
    const doc: FuncionarioCache = {
      _id: input.funcionarioId,
      codigoFun: input.codigoFun,
      nome: input.nome,
      setor: input.setor ?? null,
      salarioBase: input.salarioBase,
      numeroDependentes: input.numeroDependentes,
      ativo: input.ativo,
      updatedAt: now,
    }
    await this.collection.updateOne({ _id: input.funcionarioId }, { $set: doc }, { upsert: true })
    return doc
  }

  async marcarInativo(funcionarioId: string): Promise<boolean> {
    const result = await this.collection.updateOne(
      { _id: funcionarioId },
      { $set: { ativo: false, updatedAt: new Date() } },
    )
    return result.modifiedCount === 1
  }
}
