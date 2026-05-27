import type { Db } from 'mongodb'

/**
 * Lock cooperativo via documento Mongo. Idempotente — se outro processo já
 * tomou o lock, `acquire` retorna false. TTL definido em ensureIndexes
 * (1h) garante que um lock órfão (instância morreu) é liberado automaticamente.
 *
 * Não é distribuído-correto-em-todos-os-cenários (sem fencing token), mas é
 * suficiente para garantir que 2 instâncias do ms-ferias não rodem o MESMO
 * job no mesmo momento. Casos de corrida raríssimos resolvem-se na próxima
 * execução do job (todas operações dele são idempotentes).
 */
export interface JobLock {
  release(): Promise<void>
}

export async function acquireJobLock(db: Db, name: string): Promise<JobLock | null> {
  const coll = db.collection('jobs_locks')
  try {
    await coll.insertOne({ _id: name, lockedAt: new Date() } as never)
    return {
      async release() {
        await coll.deleteOne({ _id: name } as never)
      },
    }
  } catch (err) {
    const code = (err as { code?: number }).code
    if (code === 11000) return null // E11000 duplicate key — outro pegou primeiro
    throw err
  }
}
