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

const DB_NAME = 'hr-ferias-test'

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
  await db.collection('periodos_aquisitivos').createIndexes([
    { key: { funcionarioId: 1, status: 1 }, name: 'periodos_aquisitivos_funcionario_status' },
    { key: { dataLimiteGozo: 1, status: 1 }, name: 'periodos_aquisitivos_vencimento' },
    { key: { codigoFun: 1 }, name: 'periodos_aquisitivos_codigo_fun' },
  ])

  await db.collection('solicitacoes_ferias').createIndexes([
    { key: { codigo: 1 }, unique: true, name: 'solicitacoes_codigo_unique' },
    { key: { funcionarioId: 1, status: 1 }, name: 'solicitacoes_funcionario_status' },
    { key: { periodoAquisitivoId: 1, status: 1 }, name: 'solicitacoes_aquisitivo_status' },
    { key: { status: 1, createdAt: -1 }, name: 'solicitacoes_status_created' },
  ])

  await db.collection('periodos_gozo').createIndexes([
    { key: { funcionarioId: 1, status: 1 }, name: 'periodos_gozo_funcionario_status' },
    { key: { status: 1, dataInicio: 1 }, name: 'periodos_gozo_iniciar' },
    { key: { status: 1, dataFim: 1 }, name: 'periodos_gozo_concluir' },
    { key: { solicitacaoId: 1 }, name: 'periodos_gozo_solicitacao' },
  ])

  await db.collection('contadores').createIndex({ _id: 1 }, { name: 'contadores_id' })

  await db.collection('auditoria').createIndexes([
    { key: { recurso: 1, recursoId: 1, createdAt: -1 }, name: 'auditoria_recurso' },
    { key: { usuarioId: 1, createdAt: -1 }, name: 'auditoria_usuario' },
    { key: { createdAt: -1 }, name: 'auditoria_created' },
  ])

  await db
    .collection('jobs_locks')
    .createIndex({ lockedAt: 1 }, { name: 'jobs_locks_ttl', expireAfterSeconds: 3600 })
}
