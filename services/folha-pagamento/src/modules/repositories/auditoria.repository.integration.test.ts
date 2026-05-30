/**
 * Integration test do `AuditoriaRepository` contra Mongo real.
 *
 * Garante:
 *   - create() popula campos opcionais (`valorAnterior`, `valorNovo`,
 *     `ip`, `userAgent`) como `null` quando ausentes
 *   - listPorRecurso() usa o índice `auditoria_recurso` (recurso +
 *     recursoId + createdAt:-1) e retorna em ordem decrescente
 *   - limit funciona
 *
 * Comando: `pnpm --filter @hr-core/folha-pagamento test:integration`
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { startMongoHarness, type MongoHarness } from '../../../test/mongo-harness.js'
import { AuditoriaRepository } from './auditoria.repository.js'

describe('AuditoriaRepository (integration, mongo real)', () => {
  let mongo: MongoHarness
  let repo: AuditoriaRepository

  beforeAll(async () => {
    mongo = await startMongoHarness()
    repo = new AuditoriaRepository(mongo.db)
  }, 90_000)

  afterAll(async () => {
    await mongo.stop()
  })

  beforeEach(async () => {
    await mongo.reset()
  })

  it('create() persiste todos os campos informados', async () => {
    const created = await repo.create({
      usuarioId: 'coord-1',
      acao: 'FOLHA_ABERTA',
      recurso: 'folhas',
      recursoId: 'folha-abc',
      valorAnterior: null,
      valorNovo: { status: 'ABERTA', codigo: 'FOLHA000001' },
      ip: '192.168.1.1',
      userAgent: 'Mozilla/5.0',
    })

    expect(created._id).toBeDefined()
    expect(created.acao).toBe('FOLHA_ABERTA')
    expect(created.valorNovo).toEqual({ status: 'ABERTA', codigo: 'FOLHA000001' })
    expect(created.ip).toBe('192.168.1.1')
    expect(created.createdAt).toBeInstanceOf(Date)
  })

  it('create() normaliza campos opcionais ausentes para null', async () => {
    const created = await repo.create({
      usuarioId: 'coord-1',
      acao: 'FOLHA_PROCESSADA',
      recurso: 'folhas',
      recursoId: 'folha-abc',
    })

    expect(created.valorAnterior).toBeNull()
    expect(created.valorNovo).toBeNull()
    expect(created.ip).toBeNull()
    expect(created.userAgent).toBeNull()
  })

  it('listPorRecurso() filtra por recurso+recursoId e ordena por createdAt desc', async () => {
    // 3 registros para folha A em ordem
    for (let i = 1; i <= 3; i++) {
      await repo.create({
        usuarioId: 'coord-1',
        acao: 'FOLHA_VERBA_LANCADA',
        recurso: 'folhas',
        recursoId: 'folha-A',
        valorNovo: { iteracao: i },
      })
      await new Promise((r) => setTimeout(r, 5)) // garante createdAt diferente
    }
    // 1 registro para folha B (ruído)
    await repo.create({
      usuarioId: 'coord-1',
      acao: 'FOLHA_ABERTA',
      recurso: 'folhas',
      recursoId: 'folha-B',
    })

    const result = await repo.listPorRecurso('folhas', 'folha-A')
    expect(result).toHaveLength(3)
    // Ordem decrescente — última criada vem primeiro
    expect((result[0]?.valorNovo as { iteracao: number }).iteracao).toBe(3)
    expect((result[2]?.valorNovo as { iteracao: number }).iteracao).toBe(1)
  })

  it('listPorRecurso() respeita o limit', async () => {
    for (let i = 0; i < 10; i++) {
      await repo.create({
        usuarioId: 'coord-1',
        acao: 'FOLHA_VERBA_LANCADA',
        recurso: 'folhas',
        recursoId: 'folha-A',
      })
    }

    const result = await repo.listPorRecurso('folhas', 'folha-A', 3)
    expect(result).toHaveLength(3)
  })

  it('listPorRecurso() retorna lista vazia quando não há registros', async () => {
    const result = await repo.listPorRecurso('folhas', 'inexistente')
    expect(result).toEqual([])
  })
})
