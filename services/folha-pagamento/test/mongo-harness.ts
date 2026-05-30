import { MongoDBContainer, type StartedMongoDBContainer } from '@testcontainers/mongodb'
import { MongoClient, type Db } from 'mongodb'

/**
 * Harness Mongo via testcontainers — sobe um Mongo 7 ephemeral por suite,
 * dropa o database entre testes pra isolar estado, e cria os índices
 * esperados pelo serviço (mesma fonte da verdade que `src/database/mongo.ts`).
 *
 * Uso:
 *
 *   let mongo: MongoHarness
 *   beforeAll(async () => { mongo = await startMongoHarness() }, 60_000)
 *   afterAll(async () => { await mongo.stop() })
 *   beforeEach(async () => { await mongo.reset() })
 *
 * `mongo.db` é o handle passado para repositories e `buildApp({ db })`.
 *
 * Custo: ~5-8s no primeiro start (pull da imagem mongo:7 se ainda não local).
 * Subsequentes: ~2-3s.
 */
export interface MongoHarness {
  readonly uri: string
  readonly client: MongoClient
  readonly db: Db
  reset(): Promise<void>
  stop(): Promise<void>
}

const DB_NAME = 'hr-folha-test'

export async function startMongoHarness(): Promise<MongoHarness> {
  const container: StartedMongoDBContainer = await new MongoDBContainer('mongo:7').start()

  const uri = container.getConnectionString()
  const client = new MongoClient(uri, { directConnection: true })
  await client.connect()
  const db = client.db(DB_NAME)
  await ensureIndexes(db)

  async function reset(): Promise<void> {
    const collections = await db.listCollections().toArray()
    await Promise.all(collections.map((c) => db.collection(c.name).deleteMany({})))
  }

  async function stop(): Promise<void> {
    await client.close()
    await container.stop()
  }

  return { uri, client, db, reset, stop }
}

/**
 * Cria índices manualmente — idêntico aos do `src/database/mongo.ts`.
 * Mantido aqui em vez de chamar `ensureIndexes()` do source para que o
 * teste falhe se alguém adicionar/remover índice sem refletir na suite.
 */
async function ensureIndexes(db: Db): Promise<void> {
  await db.collection('folhas').createIndexes([
    { key: { codigo: 1 }, unique: true, name: 'folhas_codigo_unique' },
    {
      key: { funcionarioId: 1, tipo: 1, competencia: 1 },
      unique: true,
      name: 'folhas_funcionario_tipo_competencia_unique',
    },
    { key: { codigoFun: 1, createdAt: -1 }, name: 'folhas_codigo_fun_created' },
    { key: { competencia: 1, status: 1 }, name: 'folhas_competencia_status' },
    { key: { status: 1, createdAt: -1 }, name: 'folhas_status_created' },
    { key: { periodoGozoId: 1 }, name: 'folhas_periodo_gozo', sparse: true },
  ])

  await db.collection('funcionarios_cache').createIndexes([
    { key: { codigoFun: 1 }, unique: true, name: 'funcionarios_cache_codigo_unique' },
    { key: { ativo: 1 }, name: 'funcionarios_cache_ativo' },
  ])

  await db.collection('contadores').createIndex({ _id: 1 }, { name: 'contadores_id' })

  await db.collection('auditoria').createIndexes([
    { key: { recurso: 1, recursoId: 1, createdAt: -1 }, name: 'auditoria_recurso' },
    { key: { usuarioId: 1, createdAt: -1 }, name: 'auditoria_usuario' },
    { key: { createdAt: -1 }, name: 'auditoria_created' },
  ])
}
