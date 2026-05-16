import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

describe('database.mongo', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  afterEach(async () => {
    const mod = await import('./mongo.js')
    await mod.closeMongo()
    vi.unstubAllEnvs()
  })

  it('getDb throws if connectMongo was not called first', async () => {
    const mod = await import('./mongo.js')
    expect(() => mod.getDb()).toThrow(/MongoDB not connected/)
  })

  it('connectMongo connects and getDb returns the same Db instance', async () => {
    const mod = await import('./mongo.js')
    const db1 = await mod.connectMongo()
    const db2 = await mod.connectMongo() // segunda chamada é idempotente
    const db3 = mod.getDb()
    expect(db1).toBe(db2)
    expect(db1).toBe(db3)
  })

  it('ensureIndexes creates the expected indexes', async () => {
    const mod = await import('./mongo.js')
    const db = await mod.connectMongo()

    const userIdx = await db.collection('users').indexes()
    expect(userIdx.find((i) => i.name === 'users_email_unique')?.unique).toBe(true)
    expect(userIdx.find((i) => i.name === 'users_created_at')).toBeTruthy()

    const refreshIdx = await db.collection('refresh_tokens').indexes()
    expect(refreshIdx.find((i) => i.name === 'refresh_tokens_jti_hash_unique')?.unique).toBe(true)
    expect(refreshIdx.find((i) => i.name === 'refresh_tokens_user_id')).toBeTruthy()
    const ttl = refreshIdx.find((i) => i.name === 'refresh_tokens_ttl')
    expect(ttl?.expireAfterSeconds).toBe(0)
  })

  it('closeMongo is idempotent (safe to call twice)', async () => {
    const mod = await import('./mongo.js')
    await mod.connectMongo()
    await mod.closeMongo()
    await expect(mod.closeMongo()).resolves.toBeUndefined()
  })
})
