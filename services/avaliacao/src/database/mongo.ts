import { MongoClient, type Db } from 'mongodb'

import { env } from '../config/env.js'

let client: MongoClient | null = null
let db: Db | null = null

export async function connectMongo(): Promise<Db> {
  if (db) return db
  client = new MongoClient(env.MONGO_URL, {
    appName: 'hr-core-avaliacao',
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
  // avaliadores — unicidade por usuarioId + busca por setor
  await database.collection('avaliadores').createIndexes([
    { key: { usuarioId: 1 }, unique: true, name: 'avaliadores_usuario_unique' },
    { key: { setor: 1, ativo: 1 }, name: 'avaliadores_setor_ativo' },
  ])

  // avaliacoes — codigo unico, busca por funcionário/avaliador/setor
  await database.collection('avaliacoes').createIndexes([
    { key: { codigo: 1 }, unique: true, name: 'avaliacoes_codigo_unique' },
    { key: { codigoFun: 1, createdAt: -1 }, name: 'avaliacoes_funcionario_created' },
    { key: { avaliadorId: 1, createdAt: -1 }, name: 'avaliacoes_avaliador_created' },
    { key: { setor: 1, createdAt: -1 }, name: 'avaliacoes_setor_created' },
  ])

  // funcionarios_cache — busca por codigoFun + filtro por setor
  await database.collection('funcionarios_cache').createIndexes([
    { key: { codigoFun: 1 }, unique: true, name: 'funcionarios_cache_codigo_unique' },
    { key: { setor: 1 }, name: 'funcionarios_cache_setor' },
  ])

  // contadores — sequência atômica do código AVAL
  await database.collection('contadores').createIndex({ _id: 1 }, { name: 'contadores_id' })

  // auditoria — listagem por recurso/usuário
  await database.collection('auditoria').createIndexes([
    { key: { recurso: 1, recursoId: 1, createdAt: -1 }, name: 'auditoria_recurso' },
    { key: { usuarioId: 1, createdAt: -1 }, name: 'auditoria_usuario' },
    { key: { createdAt: -1 }, name: 'auditoria_created' },
  ])
}
