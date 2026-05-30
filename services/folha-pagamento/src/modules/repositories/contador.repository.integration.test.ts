/**
 * Integration test do `ContadorRepository` contra Mongo real.
 *
 * Garante o comportamento atômico de `proximoValor()` — único ponto de
 * geração de código FOLHA sequencial. Race condition aqui resultaria em
 * códigos duplicados batendo no índice unique de `folhas.codigo`.
 *
 * Comando: `pnpm --filter @hr-core/folha-pagamento test:integration`
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
    const v = await repo.proximoValor('FOLHA')
    expect(v).toBe(1)

    // Verifica que o documento foi criado
    const doc = await mongo.db
      .collection<{ _id: string; sequencia: number }>('contadores')
      .findOne({ _id: 'FOLHA' })
    expect(doc).toMatchObject({ _id: 'FOLHA', sequencia: 1 })
  })

  it('proximoValor() incrementa a cada chamada sequencial', async () => {
    expect(await repo.proximoValor('FOLHA')).toBe(1)
    expect(await repo.proximoValor('FOLHA')).toBe(2)
    expect(await repo.proximoValor('FOLHA')).toBe(3)
  })

  it('contadores diferentes mantêm sequências independentes', async () => {
    expect(await repo.proximoValor('FOLHA')).toBe(1)
    expect(await repo.proximoValor('OUTRO')).toBe(1)
    expect(await repo.proximoValor('FOLHA')).toBe(2)
    expect(await repo.proximoValor('OUTRO')).toBe(2)
  })

  it('proximoValor() é atômica em paralelo — sem valores duplicados', async () => {
    // 50 chamadas concorrentes — o conjunto resultante deve ser exatamente {1..50}
    const results = await Promise.all(Array.from({ length: 50 }, () => repo.proximoValor('FOLHA')))
    const unique = new Set(results)
    expect(unique.size).toBe(50)
    expect(Math.min(...results)).toBe(1)
    expect(Math.max(...results)).toBe(50)
  })
})
