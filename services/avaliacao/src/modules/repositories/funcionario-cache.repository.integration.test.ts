/**
 * Integration test do `FuncionarioCacheRepository` contra Mongo real.
 *
 * Cobre o índice unique de `codigoFun` e o `upsert` baseado em
 * `replaceOne` (substitui todo o documento — diferente do
 * folha-pagamento que faz `updateOne $set`).
 *
 * Comando: `pnpm --filter @hr-core/avaliacao test:integration`
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { startMongoHarness, type MongoHarness } from '../../../test/mongo-harness.js'
import { FuncionarioCacheRepository } from './funcionario-cache.repository.js'

const FUNCIONARIO_ID = '00000000-0000-0000-0000-000000000abc'
const CODIGO_FUN = 'FUN12345678900'

describe('FuncionarioCacheRepository (integration, mongo real)', () => {
  let mongo: MongoHarness
  let repo: FuncionarioCacheRepository

  beforeAll(async () => {
    mongo = await startMongoHarness()
    repo = new FuncionarioCacheRepository(mongo.db)
  }, 90_000)

  afterAll(async () => {
    await mongo.stop()
  })

  beforeEach(async () => {
    await mongo.reset()
  })

  it('upsert() cria documento se não existir', async () => {
    const doc = await repo.upsert({
      _id: FUNCIONARIO_ID,
      codigoFun: CODIGO_FUN,
      nome: 'João da Silva',
      setor: 'Tecnologia',
      ativo: true,
    })

    expect(doc._id).toBe(FUNCIONARIO_ID)
    expect(doc.codigoFun).toBe(CODIGO_FUN)
    expect(doc.setor).toBe('Tecnologia')
    expect(doc.ativo).toBe(true)
    expect(doc.updatedAt).toBeInstanceOf(Date)
  })

  it('upsert() substitui documento existente (replaceOne)', async () => {
    await repo.upsert({
      _id: FUNCIONARIO_ID,
      codigoFun: CODIGO_FUN,
      nome: 'João',
      setor: 'Tecnologia',
      ativo: true,
    })

    // Simula transferência de setor
    await repo.upsert({
      _id: FUNCIONARIO_ID,
      codigoFun: CODIGO_FUN,
      nome: 'João',
      setor: 'Recursos Humanos',
      ativo: true,
    })

    const found = await repo.findById(FUNCIONARIO_ID)
    expect(found?.setor).toBe('Recursos Humanos')
  })

  it('findById() e findByCodigoFun() acham o mesmo doc', async () => {
    await repo.upsert({
      _id: FUNCIONARIO_ID,
      codigoFun: CODIGO_FUN,
      nome: 'João',
      setor: 'Tecnologia',
      ativo: true,
    })

    const porId = await repo.findById(FUNCIONARIO_ID)
    const porCodigo = await repo.findByCodigoFun(CODIGO_FUN)
    expect(porId?._id).toBe(porCodigo?._id)
    expect(porId?._id).toBe(FUNCIONARIO_ID)
  })

  it('findByCodigoFun() retorna null quando inexistente', async () => {
    const result = await repo.findByCodigoFun('FUN99999999999')
    expect(result).toBeNull()
  })

  it('marcarInativo() seta ativo=false sem retorno', async () => {
    await repo.upsert({
      _id: FUNCIONARIO_ID,
      codigoFun: CODIGO_FUN,
      nome: 'João',
      setor: 'Tecnologia',
      ativo: true,
    })

    await expect(repo.marcarInativo(FUNCIONARIO_ID)).resolves.toBeUndefined()

    const found = await repo.findById(FUNCIONARIO_ID)
    expect(found?.ativo).toBe(false)
  })

  it('marcarInativo() em id inexistente é no-op', async () => {
    await expect(repo.marcarInativo('inexistente')).resolves.toBeUndefined()
  })

  it('índice unique de codigoFun bloqueia 2 funcionarioIds com mesmo código', async () => {
    await repo.upsert({
      _id: 'fid-1',
      codigoFun: CODIGO_FUN,
      nome: 'João',
      setor: 'Tecnologia',
      ativo: true,
    })

    await expect(
      repo.upsert({
        _id: 'fid-2',
        codigoFun: CODIGO_FUN,
        nome: 'Outro',
        setor: 'Recursos Humanos',
        ativo: true,
      }),
    ).rejects.toThrow()
  })
})
