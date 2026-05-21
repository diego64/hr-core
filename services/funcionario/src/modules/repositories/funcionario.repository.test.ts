import { ObjectId, type Db } from 'mongodb'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { cleanCollections, closeTestDb, getTestDb } from '../../../test/db.js'
import { FuncionarioRepository } from './funcionario.repository.js'

describe('FuncionarioRepository (integração com Mongo)', () => {
  let db: Db
  let repo: FuncionarioRepository

  beforeAll(async () => {
    db = await getTestDb()
    repo = new FuncionarioRepository(db)
  })

  beforeEach(async () => {
    await cleanCollections(db)
  })

  afterAll(async () => {
    await closeTestDb()
  })

  function input(overrides: Partial<Parameters<typeof repo.create>[0]> = {}) {
    return {
      codigoFun: 'FUN11144477735',
      codigoHR: 'HR0000001',
      nome: 'João Silva',
      cpf: '11144477735',
      email: 'joao@x.com',
      telefone: '11999999999',
      cargo: 'Dev',
      departamento: 'Tech',
      gestorId: null,
      status: 'ATIVO' as const,
      ...overrides,
    }
  }

  it('create persiste e retorna documento com defaults aplicados', async () => {
    const f = await repo.create(input())
    expect(f._id).toBeInstanceOf(ObjectId)
    expect(f.email).toBe('joao@x.com')
    expect(f.status).toBe('ATIVO')
    expect(f.createdAt).toBeInstanceOf(Date)
  })

  it('create aplica defaults do workflow quando status não é fornecido', async () => {
    // omite status do helper para exercitar o fallback `?? 'PENDENTE'`
    const { status: _omit, ...sem_status } = input()
    const f = await repo.create(sem_status)
    expect(f.status).toBe('PENDENTE')
    expect(f.score).toBe(0)
    expect(f.asoValido).toBe(false)
    expect(f.ctpsDigital).toBe(false)
  })

  it('atualizarValidacao persiste score + flags + updatedAt', async () => {
    const f = await repo.create(input())
    const before = f.updatedAt
    await new Promise((r) => setTimeout(r, 5))
    const ok = await repo.atualizarValidacao(f._id, {
      score: 100,
      asoValido: true,
      ctpsDigital: true,
    })
    expect(ok).toBe(true)
    const after = await repo.findById(f._id)
    expect(after?.score).toBe(100)
    expect(after?.asoValido).toBe(true)
    expect(after?.ctpsDigital).toBe(true)
    expect(after!.updatedAt.getTime()).toBeGreaterThan(before.getTime())
  })

  it('atualizarValidacao retorna false para id inexistente', async () => {
    expect(
      await repo.atualizarValidacao(new ObjectId(), {
        score: 0,
        asoValido: false,
        ctpsDigital: false,
      }),
    ).toBe(false)
  })

  it('atualizarStatus respeita o status atual (guarda contra race)', async () => {
    const f = await repo.create(input({ status: 'PENDENTE' }))
    const ok = await repo.atualizarStatus(f._id, 'PENDENTE', 'EM_VALIDACAO')
    expect(ok).toBe(true)
    expect((await repo.findById(f._id))?.status).toBe('EM_VALIDACAO')

    // segunda tentativa com from desatualizado falha — alguém já mudou
    const stale = await repo.atualizarStatus(f._id, 'PENDENTE', 'APROVADO')
    expect(stale).toBe(false)
    expect((await repo.findById(f._id))?.status).toBe('EM_VALIDACAO')
  })

  describe('atualizarCampos', () => {
    it('aplica apenas as chaves definidas (preserva resto)', async () => {
      const f = await repo.create(input())
      const ok = await repo.atualizarCampos(f._id, { cargo: 'Tech Lead' })
      expect(ok).toBe(true)
      const after = await repo.findById(f._id)
      expect(after?.cargo).toBe('Tech Lead')
      expect(after?.telefone).toBe(f.telefone) // não mexeu
      expect(after?.departamento).toBe(f.departamento)
    })

    it('faz trim em strings', async () => {
      const f = await repo.create(input())
      await repo.atualizarCampos(f._id, { departamento: '  Eng  ' })
      expect((await repo.findById(f._id))?.departamento).toBe('Eng')
    })

    it('aceita gestorId = null para limpar', async () => {
      const f = await repo.create(input({ gestorId: 'gid-x' }))
      await repo.atualizarCampos(f._id, { gestorId: null })
      expect((await repo.findById(f._id))?.gestorId).toBeNull()
    })

    it('retorna false para id inexistente', async () => {
      expect(await repo.atualizarCampos(new ObjectId(), { cargo: 'X' })).toBe(false)
    })
  })

  it('create lowercase o email', async () => {
    const f = await repo.create(input({ email: 'JOAO@X.COM' }))
    expect(f.email).toBe('joao@x.com')
  })

  it('findById, findByCpf, findByCodigoFun, findByEmail funcionam', async () => {
    const created = await repo.create(input())
    expect((await repo.findById(created._id))?.email).toBe('joao@x.com')
    expect((await repo.findById(created._id.toHexString()))?.email).toBe('joao@x.com')
    expect((await repo.findByCpf('11144477735'))?.email).toBe('joao@x.com')
    expect((await repo.findByCodigoFun('FUN11144477735'))?.email).toBe('joao@x.com')
    expect((await repo.findByEmail('JOAO@X.COM'))?.email).toBe('joao@x.com')
  })

  it('findById retorna null para id inexistente', async () => {
    expect(await repo.findById(new ObjectId())).toBeNull()
  })

  it('list paginado retorna total + pages', async () => {
    await repo.create(
      input({
        cpf: '11144477735',
        email: 'a@x.com',
        codigoFun: 'FUN11144477735',
        codigoHR: 'HR0000001',
      }),
    )
    await repo.create(
      input({
        cpf: '52998224725',
        email: 'b@x.com',
        codigoFun: 'FUN52998224725',
        codigoHR: 'HR0000002',
      }),
    )
    const page = await repo.list({}, 1, 10)
    expect(page.total).toBe(2)
    expect(page.items).toHaveLength(2)
    expect(page.pages).toBe(1)
  })

  it('list filtra por status', async () => {
    await repo.create(input({ status: 'ATIVO' }))
    await repo.create(
      input({
        status: 'DESLIGADO',
        cpf: '52998224725',
        email: 'b@x.com',
        codigoFun: 'FUN52998224725',
        codigoHR: 'HR0000002',
      }),
    )
    const ativos = await repo.list({ status: 'ATIVO' }, 1, 10)
    expect(ativos.total).toBe(1)
    expect(ativos.items[0]!.status).toBe('ATIVO')
  })

  it('desligar marca como DESLIGADO e retorna true', async () => {
    const f = await repo.create(input())
    const ok = await repo.desligar(f._id)
    expect(ok).toBe(true)
    const after = await repo.findById(f._id)
    expect(after?.status).toBe('DESLIGADO')
  })

  it('desligar é idempotente — segundo chamado retorna false (já estava DESLIGADO)', async () => {
    const f = await repo.create(input())
    expect(await repo.desligar(f._id)).toBe(true)
    expect(await repo.desligar(f._id)).toBe(false)
  })
})
