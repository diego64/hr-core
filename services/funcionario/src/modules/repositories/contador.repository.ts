import { type Db, type Collection } from 'mongodb'

interface ContadorDoc {
  _id: string
  sequencia: number
}

/**
 * Geração atômica de sequência para códigos como HR0000001.
 *
 * Usa findOneAndUpdate com $inc + upsert para garantir que duas requisições
 * paralelas não recebam o mesmo número:
 *   - se o doc não existe, cria com sequencia=1 (depois do $inc inicial em 0)
 *   - se existe, incrementa atomicamente e retorna o valor novo
 */
export class ContadorRepository {
  private readonly collection: Collection<ContadorDoc>

  constructor(db: Db) {
    this.collection = db.collection<ContadorDoc>('contadores')
  }

  /**
   * Retorna o próximo valor da sequência do contador identificado por `id`
   * (ex.: "HR"). Atômico, idempotente em races.
   */
  async proximoValor(id: string): Promise<number> {
    const result = await this.collection.findOneAndUpdate(
      { _id: id },
      { $inc: { sequencia: 1 } },
      { upsert: true, returnDocument: 'after' },
    )
    if (!result) {
      // Em condições normais o upsert sempre retorna doc; defesa contra
      // configuração inesperada do driver.
      throw new Error(`Falha ao incrementar contador ${id}`)
    }
    return result.sequencia
  }
}
