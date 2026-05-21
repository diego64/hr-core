import { ObjectId, type Db } from 'mongodb'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { cleanCollections, closeTestDb, getTestDb } from '../../../test/db.js'
import { AprovacaoRepository } from './aprovacao.repository.js'

describe('AprovacaoRepository (integração com Mongo)', () => {
  let db: Db
  let repo: AprovacaoRepository

  beforeAll(async () => {
    db = await getTestDb()
    repo = new AprovacaoRepository(db)
  })

  beforeEach(async () => {
    await cleanCollections(db)
  })

  afterAll(async () => {
    await closeTestDb()
  })

  function input(overrides: Partial<Parameters<typeof repo.create>[0]> = {}) {
    return {
      funcionarioId: new ObjectId(),
      tipo: 'ALTERACAO_CADASTRAL' as const,
      camposAlterados: { cargo: 'Tech Lead' },
      solicitadoPor: 'user-1',
      ...overrides,
    }
  }

  it('create persiste com status PENDENTE e payload imutável', async () => {
    const a = await repo.create(input({ camposAlterados: { telefone: '11999', cargo: 'X' } }))
    expect(a.status).toBe('PENDENTE')
    expect(a.camposAlterados).toEqual({ telefone: '11999', cargo: 'X' })
    expect(a.aprovadoPor).toBeNull()
  })

  it('list filtra por status e ordena por solicitadoEm desc', async () => {
    const fId = new ObjectId()
    const a1 = await repo.create(input({ funcionarioId: fId }))
    await new Promise((r) => setTimeout(r, 5))
    const a2 = await repo.create(input({ funcionarioId: fId }))
    await repo.aprovar(a2._id, 'coord-1')

    const pendentes = await repo.list({ status: 'PENDENTE' })
    expect(pendentes).toHaveLength(1)
    expect(pendentes[0]!._id.equals(a1._id)).toBe(true)

    const aprovadas = await repo.list({ status: 'APROVADA' })
    expect(aprovadas).toHaveLength(1)
  })

  it('list filtra por funcionarioId (string ou ObjectId)', async () => {
    const f1 = new ObjectId()
    const f2 = new ObjectId()
    await repo.create(input({ funcionarioId: f1 }))
    await repo.create(input({ funcionarioId: f2 }))
    expect(await repo.list({ funcionarioId: f1 })).toHaveLength(1)
    expect(await repo.list({ funcionarioId: f1.toHexString() })).toHaveLength(1)
  })

  describe('aprovar / rejeitar', () => {
    it('aprovar grava aprovadoPor, aprovadoEm, status APROVADA', async () => {
      const a = await repo.create(input())
      expect(await repo.aprovar(a._id, 'coord-1')).toBe(true)
      const after = await repo.findById(a._id)
      expect(after?.status).toBe('APROVADA')
      expect(after?.aprovadoPor).toBe('coord-1')
      expect(after?.aprovadoEm).toBeInstanceOf(Date)
    })

    it('rejeitar grava motivo', async () => {
      const a = await repo.create(input())
      expect(await repo.rejeitar(a._id, 'coord-1', 'dados inválidos')).toBe(true)
      const after = await repo.findById(a._id)
      expect(after?.status).toBe('REJEITADA')
      expect(after?.motivoRejeicao).toBe('dados inválidos')
    })

    it('aprovar é noop em segundo chamado (filtro PENDENTE)', async () => {
      const a = await repo.create(input())
      await repo.aprovar(a._id, 'coord-1')
      expect(await repo.aprovar(a._id, 'coord-2')).toBe(false)
      expect((await repo.findById(a._id))?.aprovadoPor).toBe('coord-1')
    })
  })
})
