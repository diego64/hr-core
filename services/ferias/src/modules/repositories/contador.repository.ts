import { type Collection, type Db } from 'mongodb'

interface ContadorDoc {
  _id: string
  sequencia: number
}

/**
 * Gera sequência atômica via `findOneAndUpdate` + `$inc` + `upsert`.
 * Idêntico ao padrão do ms-funcionario (HR). Aqui usado pra FER.
 */
export class ContadorRepository {
  private readonly collection: Collection<ContadorDoc>

  constructor(db: Db) {
    this.collection = db.collection<ContadorDoc>('contadores')
  }

  async proximoValor(id: string): Promise<number> {
    const result = await this.collection.findOneAndUpdate(
      { _id: id },
      { $inc: { sequencia: 1 } },
      { upsert: true, returnDocument: 'after' },
    )
    if (!result) throw new Error(`Falha ao incrementar contador ${id}`)
    return result.sequencia
  }
}
