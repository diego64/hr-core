/**
 * Integration test do `AuditoriaRepository` contra Mongo real.
 *
 * Comando: `pnpm --filter @hr-core/avaliacao test:integration`
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
      usuarioId: 'admin-1',
      acao: 'AVALIADOR_CRIADO',
      recurso: 'avaliadores',
      recursoId: 'avaliador-abc',
      valorAnterior: null,
      valorNovo: { usuarioId: 'av-1', setor: 'Tecnologia' },
      ip: '192.168.1.1',
      userAgent: 'Mozilla/5.0',
    })

    expect(created._id).toBeDefined()
    expect(created.acao).toBe('AVALIADOR_CRIADO')
    expect(created.valorNovo).toEqual({ usuarioId: 'av-1', setor: 'Tecnologia' })
    expect(created.ip).toBe('192.168.1.1')
    expect(created.createdAt).toBeInstanceOf(Date)
  })

  it('create() normaliza campos opcionais ausentes para null', async () => {
    const created = await repo.create({
      usuarioId: 'admin-1',
      acao: 'AVALIACAO_CRIADA',
      recurso: 'avaliacoes',
      recursoId: 'av-abc',
    })

    expect(created.valorAnterior).toBeNull()
    expect(created.valorNovo).toBeNull()
    expect(created.ip).toBeNull()
    expect(created.userAgent).toBeNull()
  })

  it('listPorRecurso() filtra por (recurso, recursoId) e ordena por createdAt desc', async () => {
    for (let i = 1; i <= 3; i++) {
      await repo.create({
        usuarioId: 'avaliador-1',
        acao: 'AVALIACAO_ATUALIZADA',
        recurso: 'avaliacoes',
        recursoId: 'av-A',
        valorNovo: { iteracao: i },
      })
      await new Promise((r) => setTimeout(r, 5))
    }
    // Ruído: outra avaliação
    await repo.create({
      usuarioId: 'admin-1',
      acao: 'AVALIACAO_CRIADA',
      recurso: 'avaliacoes',
      recursoId: 'av-B',
    })

    const result = await repo.listPorRecurso('avaliacoes', 'av-A')
    expect(result).toHaveLength(3)
    expect((result[0]?.valorNovo as { iteracao: number }).iteracao).toBe(3)
    expect((result[2]?.valorNovo as { iteracao: number }).iteracao).toBe(1)
  })

  it('listPorRecurso() respeita o limit', async () => {
    for (let i = 0; i < 10; i++) {
      await repo.create({
        usuarioId: 'admin-1',
        acao: 'AVALIACAO_CRIADA',
        recurso: 'avaliacoes',
        recursoId: 'av-A',
      })
    }

    const result = await repo.listPorRecurso('avaliacoes', 'av-A', 3)
    expect(result).toHaveLength(3)
  })

  it('listPorRecurso() retorna lista vazia quando não há registros', async () => {
    const result = await repo.listPorRecurso('avaliacoes', 'inexistente')
    expect(result).toEqual([])
  })
})
