import { MongoClient, type Db } from 'mongodb'

import { env } from '../config/env.js'

let client: MongoClient | null = null
let db: Db | null = null

export async function connectMongo(): Promise<Db> {
  if (db) return db
  client = new MongoClient(env.MONGO_URL, {
    appName: 'hr-core-funcionario',
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
  // funcionarios — códigos únicos para evitar duplicação acidental
  await database.collection('funcionarios').createIndexes([
    { key: { codigoFun: 1 }, unique: true, name: 'funcionarios_codigo_fun_unique' },
    { key: { codigoHR: 1 }, unique: true, name: 'funcionarios_codigo_hr_unique' },
    { key: { cpf: 1 }, unique: true, name: 'funcionarios_cpf_unique' },
    { key: { email: 1 }, unique: true, name: 'funcionarios_email_unique' },
    { key: { status: 1, departamento: 1 }, name: 'funcionarios_status_departamento' },
    { key: { createdAt: -1 }, name: 'funcionarios_created_at' },
  ])

  // contadores — collection global de sequências (HR, etc).
  // Documento por contador (ex: { _id: "HR", sequencia: 42 }), atualizado
  // atomicamente via findOneAndUpdate + $inc.
  await database.collection('contadores').createIndex({ _id: 1 }, { name: 'contadores_id' })

  // documentos — escaneados por funcionarioId no listByFuncionario e por
  // (funcionarioId, status, tipo) no aggregate do score engine.
  await database.collection('documentos').createIndexes([
    { key: { funcionarioId: 1, enviadoEm: -1 }, name: 'documentos_funcionario_enviado' },
    { key: { funcionarioId: 1, status: 1, tipo: 1 }, name: 'documentos_aprovados_por_tipo' },
  ])

  // aprovacoes — listagem por status (COORDENADOR vê pendentes) e por
  // funcionário (auditoria/histórico).
  await database.collection('aprovacoes').createIndexes([
    { key: { status: 1, solicitadoEm: -1 }, name: 'aprovacoes_status_solicitado' },
    { key: { funcionarioId: 1, solicitadoEm: -1 }, name: 'aprovacoes_funcionario' },
  ])
}
