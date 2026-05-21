import { ObjectId, type Db } from 'mongodb'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { cleanCollections, closeTestDb, getTestDb } from '../../../test/db.js'
import { DocumentoRepository } from './documento.repository.js'

describe('DocumentoRepository (integração com Mongo)', () => {
  let db: Db
  let repo: DocumentoRepository

  beforeAll(async () => {
    db = await getTestDb()
    repo = new DocumentoRepository(db)
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
      tipo: 'RG' as const,
      storageKey: 'funcionarios/x/y.pdf',
      nomeOriginal: 'rg.pdf',
      mimeType: 'application/pdf',
      tamanhoBytes: 100,
      enviadoPor: 'user-1',
      ...overrides,
    }
  }

  it('create persiste com defaults PENDENTE / aprovador null', async () => {
    const doc = await repo.create(input())
    expect(doc._id).toBeInstanceOf(ObjectId)
    expect(doc.status).toBe('PENDENTE')
    expect(doc.aprovadoPor).toBeNull()
    expect(doc.aprovadoEm).toBeNull()
    expect(doc.motivoRejeicao).toBeNull()
    expect(doc.enviadoEm).toBeInstanceOf(Date)
  })

  it('listByFuncionario retorna ordenado por enviadoEm desc', async () => {
    const fId = new ObjectId()
    const a = await repo.create(input({ funcionarioId: fId, tipo: 'RG' }))
    await new Promise((r) => setTimeout(r, 5))
    const b = await repo.create(input({ funcionarioId: fId, tipo: 'CPF' }))

    const docs = await repo.listByFuncionario(fId)
    expect(docs).toHaveLength(2)
    expect(docs[0]!._id.equals(b._id)).toBe(true)
    expect(docs[1]!._id.equals(a._id)).toBe(true)
  })

  it('listByFuncionario isola por funcionarioId', async () => {
    const f1 = new ObjectId()
    const f2 = new ObjectId()
    await repo.create(input({ funcionarioId: f1, tipo: 'RG' }))
    await repo.create(input({ funcionarioId: f2, tipo: 'RG' }))
    expect(await repo.listByFuncionario(f1)).toHaveLength(1)
    expect(await repo.listByFuncionario(f2)).toHaveLength(1)
  })

  describe('aprovar / rejeitar', () => {
    it('aprovar marca status, aprovador, timestamp', async () => {
      const doc = await repo.create(input())
      const ok = await repo.aprovar(doc._id, 'coord-1')
      expect(ok).toBe(true)
      const after = await repo.findById(doc._id)
      expect(after?.status).toBe('APROVADO')
      expect(after?.aprovadoPor).toBe('coord-1')
      expect(after?.aprovadoEm).toBeInstanceOf(Date)
    })

    it('aprovar é noop se já APROVADO (filtro PENDENTE)', async () => {
      const doc = await repo.create(input())
      await repo.aprovar(doc._id, 'coord-1')
      const second = await repo.aprovar(doc._id, 'coord-2')
      expect(second).toBe(false)
      const after = await repo.findById(doc._id)
      expect(after?.aprovadoPor).toBe('coord-1') // permanece o primeiro
    })

    it('rejeitar marca status e motivo', async () => {
      const doc = await repo.create(input())
      const ok = await repo.rejeitar(doc._id, 'coord-1', 'documento ilegível')
      expect(ok).toBe(true)
      const after = await repo.findById(doc._id)
      expect(after?.status).toBe('REJEITADO')
      expect(after?.motivoRejeicao).toBe('documento ilegível')
    })

    it('rejeitar é noop se já REJEITADO', async () => {
      const doc = await repo.create(input())
      await repo.rejeitar(doc._id, 'coord-1', 'm')
      expect(await repo.rejeitar(doc._id, 'coord-2', 'outro')).toBe(false)
    })
  })

  describe('listarPendentesDoFuncionario', () => {
    it('retorna apenas PENDENTES do funcionário ordenados por enviadoEm asc', async () => {
      const fId = new ObjectId()
      const outroFId = new ObjectId()

      // 2 pendentes no funcionário alvo (com gap pra ordem ser determinística)
      const a = await repo.create(input({ funcionarioId: fId, tipo: 'RG' }))
      await new Promise((r) => setTimeout(r, 5))
      const b = await repo.create(input({ funcionarioId: fId, tipo: 'CPF' }))

      // 1 aprovado no alvo — não aparece
      const c = await repo.create(input({ funcionarioId: fId, tipo: 'PIS' }))
      await repo.aprovar(c._id, 'coord')

      // 1 pendente em outro funcionário — não aparece
      await repo.create(input({ funcionarioId: outroFId, tipo: 'RG' }))

      const pendentes = await repo.listarPendentesDoFuncionario(fId)
      expect(pendentes).toHaveLength(2)
      expect(pendentes[0]!._id.equals(a._id)).toBe(true)
      expect(pendentes[1]!._id.equals(b._id)).toBe(true)
    })

    it('retorna vazio quando funcionário não tem PENDENTES', async () => {
      expect(await repo.listarPendentesDoFuncionario(new ObjectId())).toEqual([])
    })
  })

  describe('listarAprovadosPorTipo (aggregate)', () => {
    it('retorna apenas o último APROVADO de cada tipo', async () => {
      const fId = new ObjectId()
      // dois RG aprovados — só o mais recente deve aparecer
      const rgVelho = await repo.create(input({ funcionarioId: fId, tipo: 'RG' }))
      await repo.aprovar(rgVelho._id, 'coord-1')
      await new Promise((r) => setTimeout(r, 5))
      const rgNovo = await repo.create(input({ funcionarioId: fId, tipo: 'RG' }))
      await repo.aprovar(rgNovo._id, 'coord-1')

      // 1 CPF aprovado
      const cpf = await repo.create(input({ funcionarioId: fId, tipo: 'CPF' }))
      await repo.aprovar(cpf._id, 'coord-1')

      // 1 PIS apenas PENDENTE — não conta
      await repo.create(input({ funcionarioId: fId, tipo: 'PIS' }))

      // 1 ASO rejeitado — não conta
      const aso = await repo.create(input({ funcionarioId: fId, tipo: 'ASO_ADMISSIONAL' }))
      await repo.rejeitar(aso._id, 'coord-1', 'inválido')

      const aprovados = await repo.listarAprovadosPorTipo(fId)
      const ids = aprovados.map((d) => d._id.toHexString()).sort()
      const esperados = [rgNovo._id.toHexString(), cpf._id.toHexString()].sort()
      expect(ids).toEqual(esperados)
    })

    it('retorna vazio quando funcionário não tem documentos', async () => {
      expect(await repo.listarAprovadosPorTipo(new ObjectId())).toEqual([])
    })
  })
})
