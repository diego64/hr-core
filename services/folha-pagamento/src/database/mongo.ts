import { MongoClient, type Db } from 'mongodb'

import { env } from '../config/env.js'

let client: MongoClient | null = null
let db: Db | null = null

export async function connectMongo(): Promise<Db> {
  if (db) return db
  client = new MongoClient(env.MONGO_URL, {
    appName: 'hr-core-folha-pagamento',
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
  // folhas — busca por código legível, listagem por funcionário/competência/status,
  // bloqueio de duplicidade por (funcionarioId, tipo, competencia).
  await database.collection('folhas').createIndexes([
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

  // funcionarios_cache — snapshot local do salário/dependentes/ativo replicado
  // via Kafka (`FuncionarioCriado`, `SalarioAlterado`, etc). Evita chamada
  // síncrona ao ms-funcionarios no caminho crítico do processamento.
  await database.collection('funcionarios_cache').createIndexes([
    { key: { codigoFun: 1 }, unique: true, name: 'funcionarios_cache_codigo_unique' },
    { key: { ativo: 1 }, name: 'funcionarios_cache_ativo' },
  ])

  // contadores — sequência atômica do código FOLHA (mesmo padrão de FER/HR).
  await database.collection('contadores').createIndex({ _id: 1 }, { name: 'contadores_id' })

  // auditoria — listagem por recurso e por usuário.
  await database.collection('auditoria').createIndexes([
    { key: { recurso: 1, recursoId: 1, createdAt: -1 }, name: 'auditoria_recurso' },
    { key: { usuarioId: 1, createdAt: -1 }, name: 'auditoria_usuario' },
    { key: { createdAt: -1 }, name: 'auditoria_created' },
  ])
}
