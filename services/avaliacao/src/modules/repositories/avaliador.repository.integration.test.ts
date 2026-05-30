/**
 * Integration test do `AvaliadorRepository` contra Mongo real.
 *
 * Cobre o índice unique de `usuarioId` (1 usuário do auth pode ser
 * AVALIADOR de no máximo 1 setor) e a inativação via desativar().
 *
 * Comando: `pnpm --filter @hr-core/avaliacao test:integration`
 */
import { ObjectId } from 'mongodb'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { startMongoHarness, type MongoHarness } from '../../../test/mongo-harness.js'
import { AvaliadorRepository } from './avaliador.repository.js'

describe('AvaliadorRepository (integration, mongo real)', () => {
  let mongo: MongoHarness
  let repo: AvaliadorRepository

  beforeAll(async () => {
    mongo = await startMongoHarness()
    repo = new AvaliadorRepository(mongo.db)
  }, 90_000)

  afterAll(async () => {
    await mongo.stop()
  })

  beforeEach(async () => {
    await mongo.reset()
  })

  it('create() persiste todos os campos e marca ativo=true por default', async () => {
    const created = await repo.create({
      usuarioId: 'av-user-1',
      nome: 'Maria Avaliadora',
      email: 'maria@hr-core.local',
      setor: 'Tecnologia',
      criadoPor: 'admin-1',
    })

    expect(created.usuarioId).toBe('av-user-1')
    expect(created.setor).toBe('Tecnologia')
    expect(created.ativo).toBe(true)
    expect(created.criadoPor).toBe('admin-1')
    expect(created.createdAt).toBeInstanceOf(Date)
  })

  it('create() respeita o índice unique de usuarioId', async () => {
    await repo.create({
      usuarioId: 'av-user-1',
      nome: 'Maria',
      email: 'maria@hr-core.local',
      setor: 'Tecnologia',
      criadoPor: 'admin-1',
    })

    // Mesmo usuarioId — deve violar o unique
    await expect(
      repo.create({
        usuarioId: 'av-user-1',
        nome: 'Outra',
        email: 'outra@hr-core.local',
        setor: 'Recursos Humanos',
        criadoPor: 'admin-1',
      }),
    ).rejects.toThrow()

    // usuarioId diferente — OK
    await expect(
      repo.create({
        usuarioId: 'av-user-2',
        nome: 'João',
        email: 'joao@hr-core.local',
        setor: 'Tecnologia',
        criadoPor: 'admin-1',
      }),
    ).resolves.toBeDefined()
  })

  it('findById() retorna avaliador existente, null se inexistente, null se ObjectId inválido', async () => {
    const created = await repo.create({
      usuarioId: 'av-user-1',
      nome: 'Maria',
      email: 'maria@hr-core.local',
      setor: 'Tecnologia',
      criadoPor: 'admin-1',
    })

    const found = await repo.findById(created._id.toHexString())
    expect(found?.usuarioId).toBe('av-user-1')

    const inexistente = await repo.findById(new ObjectId().toHexString())
    expect(inexistente).toBeNull()

    const idInvalido = await repo.findById('not-a-valid-objectid')
    expect(idInvalido).toBeNull()
  })

  it('findByUsuarioId() acha pelo claim sub do JWT', async () => {
    await repo.create({
      usuarioId: 'av-user-1',
      nome: 'Maria',
      email: 'maria@hr-core.local',
      setor: 'Tecnologia',
      criadoPor: 'admin-1',
    })

    const found = await repo.findByUsuarioId('av-user-1')
    expect(found?.email).toBe('maria@hr-core.local')

    const nao = await repo.findByUsuarioId('inexistente')
    expect(nao).toBeNull()
  })

  it('list() filtra por setor e ativo, ordena por createdAt desc', async () => {
    const ti1 = await repo.create({
      usuarioId: 'ti-1',
      nome: 'TI 1',
      email: 'ti1@hr-core.local',
      setor: 'Tecnologia',
      criadoPor: 'admin-1',
    })
    await new Promise((r) => setTimeout(r, 5))
    const ti2 = await repo.create({
      usuarioId: 'ti-2',
      nome: 'TI 2',
      email: 'ti2@hr-core.local',
      setor: 'Tecnologia',
      criadoPor: 'admin-1',
    })
    await new Promise((r) => setTimeout(r, 5))
    await repo.create({
      usuarioId: 'rh-1',
      nome: 'RH 1',
      email: 'rh1@hr-core.local',
      setor: 'Recursos Humanos',
      criadoPor: 'admin-1',
    })

    const todos = await repo.list({})
    expect(todos).toHaveLength(3)
    // Mais recente primeiro
    expect(todos[0]!.usuarioId).toBe('rh-1')

    const ti = await repo.list({ setor: 'Tecnologia' })
    expect(ti).toHaveLength(2)
    expect(ti[0]!._id.toHexString()).toBe(ti2._id.toHexString()) // mais recente primeiro
    expect(ti[1]!._id.toHexString()).toBe(ti1._id.toHexString())

    // Desativa um, filtra por ativo=true
    await repo.desativar(ti1._id.toHexString())
    const ativos = await repo.list({ ativo: true })
    expect(ativos).toHaveLength(2)
    expect(ativos.some((a) => a.usuarioId === 'ti-1')).toBe(false)
  })

  it('desativar() seta ativo=false e retorna doc atualizado', async () => {
    const created = await repo.create({
      usuarioId: 'av-user-1',
      nome: 'Maria',
      email: 'maria@hr-core.local',
      setor: 'Tecnologia',
      criadoPor: 'admin-1',
    })

    const desativado = await repo.desativar(created._id.toHexString())
    expect(desativado?.ativo).toBe(false)
    expect(desativado?.updatedAt.getTime()).toBeGreaterThanOrEqual(created.updatedAt.getTime())
  })

  it('desativar() retorna null se id inexistente ou inválido', async () => {
    expect(await repo.desativar(new ObjectId().toHexString())).toBeNull()
    expect(await repo.desativar('not-a-valid-objectid')).toBeNull()
  })
})
