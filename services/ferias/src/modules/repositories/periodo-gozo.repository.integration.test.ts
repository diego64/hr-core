/**
 * Integration test do `PeriodoGozoRepository` contra Mongo real.
 *
 * Cobre:
 *   - create() com status inicial AGENDADO e valores financeiros
 *   - atualizarStatus() atômico com filter de from (race detection)
 *   - marcarPago() seta dataPagamento independente de status
 *   - listarParaIniciar/listarParaConcluir (jobs diários)
 *   - recalcularValoresAgendados() em cenário SalarioAlterado
 *
 * Comando: `pnpm --filter @hr-core/ferias test:integration`
 */
import { ObjectId } from 'mongodb'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import type { CreatePeriodoGozoInput } from '../domain/entities/periodo-gozo.js'
import { startMongoHarness, type MongoHarness } from '../../../test/mongo-harness.js'
import { PeriodoGozoRepository } from './periodo-gozo.repository.js'

const FUNCIONARIO_ID = '00000000-0000-0000-0000-000000000abc'
const CODIGO_FUN = 'FUN12345678900'
const DIA = 24 * 60 * 60 * 1000

function makeInput(overrides: Partial<CreatePeriodoGozoInput> = {}): CreatePeriodoGozoInput {
  return {
    funcionarioId: FUNCIONARIO_ID,
    codigoFun: CODIGO_FUN,
    periodoAquisitivoId: new ObjectId(),
    solicitacaoId: new ObjectId(),
    dataInicio: new Date(Date.now() + 45 * DIA),
    dataFim: new Date(Date.now() + 58 * DIA),
    diasGozo: 14,
    diasAbono: 0,
    salarioBruto: 4_000,
    valorFerias: 1_866.67,
    valorTerco: 622.22,
    valorAbono: 0,
    valorTotal: 2_488.89,
    ...overrides,
  }
}

describe('PeriodoGozoRepository (integration, mongo real)', () => {
  let mongo: MongoHarness
  let repo: PeriodoGozoRepository

  beforeAll(async () => {
    mongo = await startMongoHarness()
    repo = new PeriodoGozoRepository(mongo.db)
  }, 90_000)

  afterAll(async () => {
    await mongo.stop()
  })

  beforeEach(async () => {
    await mongo.reset()
  })

  it('create() persiste com status AGENDADO e dataPagamento null', async () => {
    const g = await repo.create(makeInput())

    expect(g.status).toBe('AGENDADO')
    expect(g.dataPagamento).toBeNull()
    expect(g.valorTotal).toBeCloseTo(2_488.89, 2)
    expect(g.createdAt).toBeInstanceOf(Date)
  })

  it('atualizarStatus() é atômica com filter de from', async () => {
    const g = await repo.create(makeInput())

    expect(await repo.atualizarStatus(g._id, 'AGENDADO', 'EM_GOZO')).toBe(true)
    // Tentativa errada de from → false (sem alterar nada)
    expect(await repo.atualizarStatus(g._id, 'AGENDADO', 'CONCLUIDO')).toBe(false)
    expect((await repo.findById(g._id))?.status).toBe('EM_GOZO')

    expect(await repo.atualizarStatus(g._id, 'EM_GOZO', 'CONCLUIDO')).toBe(true)
    expect((await repo.findById(g._id))?.status).toBe('CONCLUIDO')
  })

  it('atualizarStatus() em paralelo só permite UMA execução', async () => {
    const g = await repo.create(makeInput())

    const [a, b] = await Promise.all([
      repo.atualizarStatus(g._id, 'AGENDADO', 'EM_GOZO'),
      repo.atualizarStatus(g._id, 'AGENDADO', 'CANCELADO'),
    ])
    expect([a, b].filter(Boolean)).toHaveLength(1)
  })

  it('marcarPago() seta dataPagamento sem mudar status (matchedCount===1)', async () => {
    const g = await repo.create(makeInput())
    const dataPag = new Date()

    expect(await repo.marcarPago(g._id, dataPag)).toBe(true)
    const refetch = await repo.findById(g._id)
    expect(refetch?.dataPagamento?.getTime()).toBe(dataPag.getTime())
    expect(refetch?.status).toBe('AGENDADO') // status preservado
  })

  it('marcarPago() retorna false se id não existir', async () => {
    expect(await repo.marcarPago(new ObjectId(), new Date())).toBe(false)
  })

  it('listPorFuncionario() ordena por dataInicio desc', async () => {
    const cedo = await repo.create(makeInput({ dataInicio: new Date(Date.now() + 30 * DIA) }))
    const tarde = await repo.create(makeInput({ dataInicio: new Date(Date.now() + 90 * DIA) }))

    const list = await repo.listPorFuncionario(FUNCIONARIO_ID)
    expect(list).toHaveLength(2)
    expect(list[0]!._id.toHexString()).toBe(tarde._id.toHexString()) // mais recente primeiro
    expect(list[1]!._id.toHexString()).toBe(cedo._id.toHexString())
  })

  it('listarParaIniciar() encontra AGENDADO com dataInicio <= hoje', async () => {
    // AGENDADO com dataInicio no passado
    const noPassado = await repo.create(makeInput({ dataInicio: new Date(Date.now() - 1 * DIA) }))
    // AGENDADO no futuro — não encontra
    await repo.create(makeInput({ dataInicio: new Date(Date.now() + 30 * DIA) }))

    const result = await repo.listarParaIniciar(new Date())
    expect(result.some((g) => g._id.toHexString() === noPassado._id.toHexString())).toBe(true)
    expect(result).toHaveLength(1)
  })

  it('listarParaConcluir() encontra EM_GOZO com dataFim < hoje', async () => {
    const g = await repo.create(
      makeInput({
        dataInicio: new Date(Date.now() - 20 * DIA),
        dataFim: new Date(Date.now() - 1 * DIA),
      }),
    )
    await repo.atualizarStatus(g._id, 'AGENDADO', 'EM_GOZO')

    const result = await repo.listarParaConcluir(new Date())
    expect(result.some((x) => x._id.toHexString() === g._id.toHexString())).toBe(true)
  })

  it('recalcularValoresAgendados() atualiza apenas os AGENDADO do funcionário', async () => {
    const agendado = await repo.create(makeInput({ salarioBruto: 3_000 }))
    const emGozo = await repo.create(makeInput({ salarioBruto: 3_000 }))
    await repo.atualizarStatus(emGozo._id, 'AGENDADO', 'EM_GOZO')

    // Salário novo: 4500. Função simulada de cálculo CLT proporcional.
    const novosValores = {
      valorFerias: 2_100,
      valorTerco: 700,
      valorAbono: 0,
      valorTotal: 2_800,
    }
    const atualizados = await repo.recalcularValoresAgendados(
      FUNCIONARIO_ID,
      4_500,
      () => novosValores,
    )

    expect(atualizados).toBe(1) // só o AGENDADO

    const refetchAgendado = await repo.findById(agendado._id)
    expect(refetchAgendado?.salarioBruto).toBe(4_500)
    expect(refetchAgendado?.valorTotal).toBe(2_800)

    // O EM_GOZO não é tocado
    const refetchEmGozo = await repo.findById(emGozo._id)
    expect(refetchEmGozo?.salarioBruto).toBe(3_000)
  })
})
