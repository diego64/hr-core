/**
 * Integration test do `FuncionarioCacheRepository` contra Mongo real.
 *
 * Garante o comportamento de upsert (cache replicado via Kafka) e a
 * inativação para o consumer `FuncionarioDesligado` bloqueando abertura
 * de novas folhas para o funcionário.
 *
 * Cobre o índice unique de `codigoFun` em `funcionarios_cache`.
 *
 * Comando: `pnpm --filter @hr-core/folha-pagamento test:integration`
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

  it('upsert() cria documento se não existir e retorna shape canônico', async () => {
    const doc = await repo.upsert({
      funcionarioId: FUNCIONARIO_ID,
      codigoFun: CODIGO_FUN,
      nome: 'João da Silva',
      setor: 'Tecnologia',
      salarioBase: 5_000,
      numeroDependentes: 1,
      ativo: true,
    })

    expect(doc._id).toBe(FUNCIONARIO_ID)
    expect(doc.codigoFun).toBe(CODIGO_FUN)
    expect(doc.salarioBase).toBe(5_000)
    expect(doc.numeroDependentes).toBe(1)
    expect(doc.ativo).toBe(true)
    expect(doc.updatedAt).toBeInstanceOf(Date)
  })

  it('upsert() atualiza documento existente (sobrescreve valores)', async () => {
    await repo.upsert({
      funcionarioId: FUNCIONARIO_ID,
      codigoFun: CODIGO_FUN,
      nome: 'João',
      salarioBase: 3_000,
      numeroDependentes: 0,
      ativo: true,
    })

    // Simula evento SalarioAlterado + DependenteAdicionado
    await repo.upsert({
      funcionarioId: FUNCIONARIO_ID,
      codigoFun: CODIGO_FUN,
      nome: 'João',
      salarioBase: 4_500,
      numeroDependentes: 2,
      ativo: true,
    })

    const found = await repo.findByFuncionarioId(FUNCIONARIO_ID)
    expect(found?.salarioBase).toBe(4_500)
    expect(found?.numeroDependentes).toBe(2)
  })

  it('upsert() normaliza setor ausente para null', async () => {
    const doc = await repo.upsert({
      funcionarioId: FUNCIONARIO_ID,
      codigoFun: CODIGO_FUN,
      nome: 'João',
      salarioBase: 3_000,
      numeroDependentes: 0,
      ativo: true,
    })
    expect(doc.setor).toBeNull()
  })

  it('findByCodigoFun() e findByFuncionarioId() retornam o mesmo doc', async () => {
    await repo.upsert({
      funcionarioId: FUNCIONARIO_ID,
      codigoFun: CODIGO_FUN,
      nome: 'João',
      salarioBase: 3_000,
      numeroDependentes: 0,
      ativo: true,
    })

    const porCodigo = await repo.findByCodigoFun(CODIGO_FUN)
    const porId = await repo.findByFuncionarioId(FUNCIONARIO_ID)
    expect(porCodigo?._id).toBe(porId?._id)
    expect(porCodigo?._id).toBe(FUNCIONARIO_ID)
  })

  it('marcarInativo() flag ativo=false e retorna true', async () => {
    await repo.upsert({
      funcionarioId: FUNCIONARIO_ID,
      codigoFun: CODIGO_FUN,
      nome: 'João',
      salarioBase: 3_000,
      numeroDependentes: 0,
      ativo: true,
    })

    expect(await repo.marcarInativo(FUNCIONARIO_ID)).toBe(true)
    const found = await repo.findByFuncionarioId(FUNCIONARIO_ID)
    expect(found?.ativo).toBe(false)
  })

  it('marcarInativo() retorna false se funcionário não existir', async () => {
    expect(await repo.marcarInativo('inexistente')).toBe(false)
  })

  it('marcarInativo() chamada duas vezes mantém ativo=false (updatedAt sempre muda)', async () => {
    await repo.upsert({
      funcionarioId: FUNCIONARIO_ID,
      codigoFun: CODIGO_FUN,
      nome: 'João',
      salarioBase: 3_000,
      numeroDependentes: 0,
      ativo: true,
    })

    expect(await repo.marcarInativo(FUNCIONARIO_ID)).toBe(true)
    // 2ª chamada: ativo já é false mas updatedAt é reescrito —
    // modifiedCount continua 1. O estado semântico permanece consistente.
    expect(await repo.marcarInativo(FUNCIONARIO_ID)).toBe(true)
    const found = await repo.findByFuncionarioId(FUNCIONARIO_ID)
    expect(found?.ativo).toBe(false)
  })

  it('upsert() respeita o índice unique de codigoFun ao tentar criar 2 funcionários com mesmo código', async () => {
    await repo.upsert({
      funcionarioId: 'fid-1',
      codigoFun: CODIGO_FUN,
      nome: 'João',
      salarioBase: 3_000,
      numeroDependentes: 0,
      ativo: true,
    })

    // Outro funcionarioId mas mesmo codigoFun viola o índice unique
    await expect(
      repo.upsert({
        funcionarioId: 'fid-2',
        codigoFun: CODIGO_FUN,
        nome: 'Outro',
        salarioBase: 4_000,
        numeroDependentes: 1,
        ativo: true,
      }),
    ).rejects.toThrow()
  })
})
