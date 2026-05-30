/**
 * Integration test do `AuditoriaRepository` contra Mongo real.
 *
 * Comando: `pnpm --filter @hr-core/ferias test:integration`
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
      usuarioId: 'user-1',
      acao: 'FERIAS_SOLICITADAS',
      recurso: 'solicitacoes_ferias',
      recursoId: 'sol-abc',
      valorAnterior: null,
      valorNovo: { status: 'PENDENTE', codigo: 'FER000001' },
      ip: '192.168.1.1',
      userAgent: 'Mozilla/5.0',
    })

    expect(created._id).toBeDefined()
    expect(created.acao).toBe('FERIAS_SOLICITADAS')
    expect(created.valorNovo).toEqual({ status: 'PENDENTE', codigo: 'FER000001' })
    expect(created.ip).toBe('192.168.1.1')
    expect(created.createdAt).toBeInstanceOf(Date)
  })

  it('create() normaliza campos opcionais ausentes para null', async () => {
    const created = await repo.create({
      usuarioId: 'user-1',
      acao: 'FERIAS_APROVADAS',
      recurso: 'solicitacoes_ferias',
      recursoId: 'sol-abc',
    })

    expect(created.valorAnterior).toBeNull()
    expect(created.valorNovo).toBeNull()
    expect(created.ip).toBeNull()
    expect(created.userAgent).toBeNull()
  })

  it('listPorRecurso() filtra por (recurso, recursoId) e ordena por createdAt desc', async () => {
    for (let i = 1; i <= 3; i++) {
      await repo.create({
        usuarioId: 'coord-1',
        acao: 'FERIAS_APROVADAS',
        recurso: 'solicitacoes_ferias',
        recursoId: 'sol-A',
        valorNovo: { iteracao: i },
      })
      await new Promise((r) => setTimeout(r, 5))
    }
    await repo.create({
      usuarioId: 'coord-1',
      acao: 'FERIAS_APROVADAS',
      recurso: 'solicitacoes_ferias',
      recursoId: 'sol-B',
    })

    const result = await repo.listPorRecurso('solicitacoes_ferias', 'sol-A')
    expect(result).toHaveLength(3)
    expect((result[0]?.valorNovo as { iteracao: number }).iteracao).toBe(3)
    expect((result[2]?.valorNovo as { iteracao: number }).iteracao).toBe(1)
  })

  it('listPorRecurso() respeita o limit', async () => {
    for (let i = 0; i < 10; i++) {
      await repo.create({
        usuarioId: 'coord-1',
        acao: 'FERIAS_APROVADAS',
        recurso: 'solicitacoes_ferias',
        recursoId: 'sol-A',
      })
    }

    const result = await repo.listPorRecurso('solicitacoes_ferias', 'sol-A', 3)
    expect(result).toHaveLength(3)
  })

  it('listPorRecurso() retorna lista vazia quando não há registros', async () => {
    const result = await repo.listPorRecurso('solicitacoes_ferias', 'inexistente')
    expect(result).toEqual([])
  })
})
