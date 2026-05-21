import { type Db } from 'mongodb'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { cleanCollections, closeTestDb, getTestDb } from '../../../test/db.js'
import { ContadorRepository } from './contador.repository.js'

describe('ContadorRepository (integração com Mongo)', () => {
  let db: Db
  let repo: ContadorRepository

  beforeAll(async () => {
    db = await getTestDb()
    repo = new ContadorRepository(db)
  })

  beforeEach(async () => {
    await cleanCollections(db)
  })

  afterAll(async () => {
    await closeTestDb()
  })

  it('primeira chamada cria doc e retorna 1', async () => {
    expect(await repo.proximoValor('HR')).toBe(1)
  })

  it('chamadas sucessivas incrementam', async () => {
    expect(await repo.proximoValor('HR')).toBe(1)
    expect(await repo.proximoValor('HR')).toBe(2)
    expect(await repo.proximoValor('HR')).toBe(3)
  })

  it('contadores diferentes são independentes', async () => {
    expect(await repo.proximoValor('HR')).toBe(1)
    expect(await repo.proximoValor('OUTRO')).toBe(1)
    expect(await repo.proximoValor('HR')).toBe(2)
  })

  it('chamadas paralelas produzem valores únicos (sem race)', async () => {
    const results = await Promise.all(Array.from({ length: 20 }, () => repo.proximoValor('HR')))
    const unique = new Set(results)
    expect(unique.size).toBe(20)
    expect(Math.max(...results)).toBe(20)
  })
})
