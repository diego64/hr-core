import { MongoClient, type Db } from 'mongodb'

import { env } from '../config/env.js'

let client: MongoClient | null = null
let db: Db | null = null

export async function connectMongo(): Promise<Db> {
  if (db) return db
  client = new MongoClient(env.MONGO_URL, {
    appName: 'hr-core-ferias',
    retryWrites: true,
  })
  await client.connect()
  db = client.db(env.MONGO_DB_NAME)
  await ensureIndexes(db)
  return db
}

export async function closeMongo(): Promise<void> {
  if (client) {
    await client.close()
    client = null
    db = null
  }
}

export function getDb(): Db {
  if (!db) {
    throw new Error('MongoDB not connected — call connectMongo() before getDb()')
  }
  return db
}

async function ensureIndexes(database: Db): Promise<void> {
  // periodos_aquisitivos — busca pelo vigente de cada funcionário + jobs de
  // vencimento (filtra por dataLimiteGozo + status).
  await database.collection('periodos_aquisitivos').createIndexes([
    {
      key: { funcionarioId: 1, status: 1 },
      name: 'periodos_aquisitivos_funcionario_status',
    },
    {
      key: { dataLimiteGozo: 1, status: 1 },
      name: 'periodos_aquisitivos_vencimento',
    },
    { key: { codigoFun: 1 }, name: 'periodos_aquisitivos_codigo_fun' },
  ])

  // solicitacoes_ferias — listagem por status/funcionário, contagem de frações,
  // busca por codigo legível.
  await database.collection('solicitacoes_ferias').createIndexes([
    { key: { codigo: 1 }, unique: true, name: 'solicitacoes_codigo_unique' },
    { key: { funcionarioId: 1, status: 1 }, name: 'solicitacoes_funcionario_status' },
    {
      key: { periodoAquisitivoId: 1, status: 1 },
      name: 'solicitacoes_aquisitivo_status',
    },
    { key: { status: 1, createdAt: -1 }, name: 'solicitacoes_status_created' },
  ])

  // periodos_gozo — jobs diários (dataInicio/dataFim + status) e listagem por
  // funcionário.
  await database.collection('periodos_gozo').createIndexes([
    { key: { funcionarioId: 1, status: 1 }, name: 'periodos_gozo_funcionario_status' },
    { key: { status: 1, dataInicio: 1 }, name: 'periodos_gozo_iniciar' },
    { key: { status: 1, dataFim: 1 }, name: 'periodos_gozo_concluir' },
    { key: { solicitacaoId: 1 }, name: 'periodos_gozo_solicitacao' },
  ])

  // contadores — sequência atômica do código FER (mesmo padrão de HR no funcionario).
  await database.collection('contadores').createIndex({ _id: 1 }, { name: 'contadores_id' })

  // auditoria — listagem por recurso e por usuário.
  await database.collection('auditoria').createIndexes([
    { key: { recurso: 1, recursoId: 1, createdAt: -1 }, name: 'auditoria_recurso' },
    { key: { usuarioId: 1, createdAt: -1 }, name: 'auditoria_usuario' },
    { key: { createdAt: -1 }, name: 'auditoria_created' },
  ])

  // jobs_locks — TTL pra liberar lock se a instância morrer durante o job.
  await database
    .collection('jobs_locks')
    .createIndex({ lockedAt: 1 }, { name: 'jobs_locks_ttl', expireAfterSeconds: 3600 })
}
