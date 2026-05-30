/**
 * Integration test do `ContadorRepository` contra Mongo real.
 *
 * Garante o comportamento atômico de `proximoValor()` — único ponto de
 * geração de código FER sequencial. Race aqui geraria códigos duplicados
 * batendo no índice unique de `solicitacoes_ferias.codigo`.
 *
 * Comando: `pnpm --filter @hr-core/ferias test:integration`
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { startMongoHarness, type MongoHarness } from '../../../test/mongo-harness.js'
import { ContadorRepository } from './contador.repository.js'

describe('ContadorRepository (integration, mongo real)', () => {
  let mongo: MongoHarness
  let repo: ContadorRepository

  beforeAll(async () => {
    mongo = await startMongoHarness()
    repo = new ContadorRepository(mongo.db)
  }, 90_000)

  afterAll(async () => {
    await mongo.stop()
  })

  beforeEach(async () => {
    await mongo.reset()
  })

  it('proximoValor() faz upsert na primeira chamada e retorna 1', async () => {
    const v = await repo.proximoValor('FER')
    expect(v).toBe(1)

    const doc = await mongo.db
      .collection<{ _id: string; sequencia: number }>('contadores')
      .findOne({ _id: 'FER' })
    expect(doc).toMatchObject({ _id: 'FER', sequencia: 1 })
  })

  it('proximoValor() incrementa a cada chamada sequencial', async () => {
    expect(await repo.proximoValor('FER')).toBe(1)
    expect(await repo.proximoValor('FER')).toBe(2)
    expect(await repo.proximoValor('FER')).toBe(3)
  })

  it('contadores diferentes mantêm sequências independentes', async () => {
    expect(await repo.proximoValor('FER')).toBe(1)
    expect(await repo.proximoValor('OUTRO')).toBe(1)
    expect(await repo.proximoValor('FER')).toBe(2)
    expect(await repo.proximoValor('OUTRO')).toBe(2)
  })

  it('proximoValor() é atômica em paralelo — sem valores duplicados', async () => {
    const results = await Promise.all(Array.from({ length: 50 }, () => repo.proximoValor('FER')))
    const unique = new Set(results)
    expect(unique.size).toBe(50)
    expect(Math.min(...results)).toBe(1)
    expect(Math.max(...results)).toBe(50)
  })
})
