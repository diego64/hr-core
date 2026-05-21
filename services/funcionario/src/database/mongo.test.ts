/**
 * Cobertura do módulo de conexão Mongo + ensureIndexes. Roda contra o Mongo
 * real do compose (porta 27018), banco isolado `hr-funcionarios-conn-test`
 * para não interferir com outros testes.
 */
import { MongoClient } from 'mongodb'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const TEST_DB = 'hr-funcionarios-conn-test'

async function freshConnectModule() {
  vi.resetModules()
  return import('./mongo.js')
}

async function wipeDb(): Promise<void> {
  const client = new MongoClient(process.env.MONGO_URL ?? 'mongodb://localhost:27018')
  await client.connect()
  try {
    await client.db(TEST_DB).dropDatabase()
  } finally {
    await client.close()
  }
}

describe('database/mongo', () => {
  beforeEach(async () => {
    vi.stubEnv('MONGO_DB_NAME', TEST_DB)
    await wipeDb()
  })

  afterEach(async () => {
    const mod = await freshConnectModule()
    await mod.closeMongo()
    vi.unstubAllEnvs()
    await wipeDb()
  })

  it('connectMongo retorna o mesmo Db em chamadas consecutivas (singleton)', async () => {
    const mod = await freshConnectModule()
    const a = await mod.connectMongo()
    const b = await mod.connectMongo()
    expect(b).toBe(a)
  })

  it('getDb antes de connectMongo lança erro descritivo', async () => {
    const mod = await freshConnectModule()
    expect(() => mod.getDb()).toThrow(/MongoDB not connected/)
  })

  it('getDb depois de connectMongo retorna o Db conectado', async () => {
    const mod = await freshConnectModule()
    const connected = await mod.connectMongo()
    expect(mod.getDb()).toBe(connected)
  })

  it('ensureIndexes cria índices únicos em funcionarios (codigoFun, codigoHR, cpf, email)', async () => {
    const mod = await freshConnectModule()
    const db = await mod.connectMongo()
    const indexes = await db.collection('funcionarios').indexes()
    const names = indexes.map((i) => i.name)
    expect(names).toEqual(
      expect.arrayContaining([
        'funcionarios_codigo_fun_unique',
        'funcionarios_codigo_hr_unique',
        'funcionarios_cpf_unique',
        'funcionarios_email_unique',
        'funcionarios_status_departamento',
        'funcionarios_created_at',
      ]),
    )
    const cpfIdx = indexes.find((i) => i.name === 'funcionarios_cpf_unique')
    expect(cpfIdx?.unique).toBe(true)
  })

  it('ensureIndexes deixa a collection contadores com o _id_ default (createIndex em _id é no-op silencioso)', async () => {
    const mod = await freshConnectModule()
    const db = await mod.connectMongo()
    const indexes = await db.collection('contadores').indexes()
    const names = indexes.map((i) => i.name)
    // O Mongo sempre garante _id_; nosso createIndex({_id:1}, {name:'contadores_id'})
    // não cria um índice novo (o _id_ default já existe). O importante é a coleção
    // existir e ter o _id_ indexado, o que é o que o repositório de contadores depende.
    expect(names).toEqual(expect.arrayContaining(['_id_']))
  })

  it('closeMongo libera a referência (getDb volta a lançar)', async () => {
    const mod = await freshConnectModule()
    await mod.connectMongo()
    await mod.closeMongo()
    expect(() => mod.getDb()).toThrow(/MongoDB not connected/)
  })

  it('closeMongo é idempotente (chamar sem conexão é no-op)', async () => {
    const mod = await freshConnectModule()
    await expect(mod.closeMongo()).resolves.toBeUndefined()
  })
})
