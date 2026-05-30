/**
 * Integration test do `AvaliacaoRepository` contra Mongo real via testcontainers.
 *
 * Cobre o que testes unitários com fake NÃO conseguem cobrir:
 *
 *   - índice unique `avaliacoes_codigo_unique` rejeitando duplicação real
 *     com `MongoServerError code 11000`.
 *   - `listar()` com combinação de filtros (codigoFun, avaliadorId, setor)
 *     e paginação real via skip/limit/countDocuments.
 *   - `update()` partial (titulo / comentario / nota independentes) e
 *     preservação de campos não tocados.
 *
 * Pré-requisito: Docker disponível no host (testcontainers spinna Mongo:7).
 *
 * Comando: `pnpm --filter @hr-core/avaliacao test:integration`
 */
import { ObjectId } from 'mongodb'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { startMongoHarness, type MongoHarness } from '../../../test/mongo-harness.js'
import { AvaliacaoRepository, type CreateAvaliacaoInput } from './avaliacao.repository.js'

const AVALIADOR_TI = new ObjectId().toHexString()
const AVALIADOR_RH = new ObjectId().toHexString()

function input(overrides: Partial<CreateAvaliacaoInput> = {}): CreateAvaliacaoInput {
  return {
    codigo: 'AVA000001',
    codigoFun: 'FUN12345678900',
    funcionarioId: 'fid-1',
    avaliadorId: AVALIADOR_TI,
    setor: 'Tecnologia',
    titulo: 'Avaliação trimestral Q2/2026',
    comentario: 'Excelente entrega no projeto X, comunicação clara com o time.',
    nota: 5,
    ...overrides,
  }
}

describe('AvaliacaoRepository (integration, mongo real)', () => {
  let mongo: MongoHarness
  let repo: AvaliacaoRepository

  beforeAll(async () => {
    mongo = await startMongoHarness()
    repo = new AvaliacaoRepository(mongo.db)
  }, 90_000)

  afterAll(async () => {
    await mongo.stop()
  })

  beforeEach(async () => {
    await mongo.reset()
  })

  it('create + findById + findByCodigo', async () => {
    const created = await repo.create(input())

    expect(created.codigo).toBe('AVA000001')
    expect(created.nota).toBe(5)

    const byId = await repo.findById(created._id.toHexString())
    expect(byId?.titulo).toBe('Avaliação trimestral Q2/2026')

    const byCodigo = await repo.findByCodigo('AVA000001')
    expect(byCodigo?._id.toHexString()).toBe(created._id.toHexString())
  })

  it('índice unique de codigo bloqueia duplicação', async () => {
    await repo.create(input({ codigo: 'AVA000001' }))
    await expect(repo.create(input({ codigo: 'AVA000001' }))).rejects.toThrow()

    // Outro código → OK mesmo para o mesmo funcionário/avaliador
    await expect(repo.create(input({ codigo: 'AVA000002' }))).resolves.toBeDefined()
  })

  it('listar() filtra por codigoFun, avaliadorId e setor', async () => {
    // 3 avaliações da Tecnologia avaliando FUN1, FUN1 e FUN2
    await repo.create(input({ codigo: 'AVA000001', codigoFun: 'FUN11111111111' }))
    await repo.create(input({ codigo: 'AVA000002', codigoFun: 'FUN11111111111' }))
    await repo.create(input({ codigo: 'AVA000003', codigoFun: 'FUN22222222222' }))
    // 1 avaliação do RH para FUN3
    await repo.create(
      input({
        codigo: 'AVA000004',
        codigoFun: 'FUN33333333333',
        avaliadorId: AVALIADOR_RH,
        setor: 'Recursos Humanos',
      }),
    )

    const todas = await repo.listar({}, 1, 20)
    expect(todas.total).toBe(4)

    const porFuncionario = await repo.listar({ codigoFun: 'FUN11111111111' }, 1, 20)
    expect(porFuncionario.total).toBe(2)
    expect(porFuncionario.items.every((a) => a.codigoFun === 'FUN11111111111')).toBe(true)

    const porAvaliador = await repo.listar({ avaliadorId: AVALIADOR_RH }, 1, 20)
    expect(porAvaliador.total).toBe(1)
    expect(porAvaliador.items[0]!.codigo).toBe('AVA000004')

    const porSetor = await repo.listar({ setor: 'Tecnologia' }, 1, 20)
    expect(porSetor.total).toBe(3)
  })

  it('listar() pagina corretamente', async () => {
    for (let i = 1; i <= 5; i++) {
      await repo.create(input({ codigo: `AVA00000${i}` }))
    }

    const page1 = await repo.listar({}, 1, 2)
    expect(page1.items).toHaveLength(2)
    expect(page1.total).toBe(5)
    expect(page1.pages).toBe(3)

    const page3 = await repo.listar({}, 3, 2)
    expect(page3.items).toHaveLength(1)
  })

  it('update() altera apenas campos informados', async () => {
    const created = await repo.create(input({ nota: 3 }))

    // Atualiza só o título
    const r1 = await repo.update(created._id.toHexString(), { titulo: 'Título revisado' })
    expect(r1?.titulo).toBe('Título revisado')
    expect(r1?.comentario).toBe(input().comentario) // preservado
    expect(r1?.nota).toBe(3) // preservada

    // Atualiza só a nota
    const r2 = await repo.update(created._id.toHexString(), { nota: 5 })
    expect(r2?.nota).toBe(5)
    expect(r2?.titulo).toBe('Título revisado') // preservada do update anterior
  })

  it('update() com id inexistente retorna null', async () => {
    const fakeId = new ObjectId().toHexString()
    const r = await repo.update(fakeId, { nota: 5 })
    expect(r).toBeNull()
  })

  it('findById e update aceitam apenas ObjectId válido', async () => {
    expect(await repo.findById('not-a-valid-objectid')).toBeNull()
    expect(await repo.update('not-a-valid-objectid', { nota: 5 })).toBeNull()
  })
})
