/**
 * Integration test do `PeriodoAquisitivoRepository` contra Mongo real.
 *
 * Cobre comportamento que mocks não capturam:
 *
 *   - create() calcula dataFim (= dataInicio + 12 meses) e dataLimiteGozo
 *     (= dataFim + 12 meses) automaticamente. Status inicial depende de
 *     se a dataFim já passou (EM_CURSO vs DISPONIVEL).
 *   - debitarSaldo() reduz saldo e promove ENCERRADO quando zera —
 *     com filter atômico de status (não pisa em períodos já encerrados).
 *   - creditarSaldo() faz reembolso ao cancelar, podendo voltar
 *     ENCERRADO → DISPONIVEL se ainda dentro do prazo.
 *   - findVigentePorFuncionario() ordena por dataInicio desc e filtra
 *     por status DISPONIVEL/EM_GOZO.
 *   - Queries de jobs (listarVencidos, listarVencendoEm).
 *
 * Comando: `pnpm --filter @hr-core/ferias test:integration`
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { startMongoHarness, type MongoHarness } from '../../../test/mongo-harness.js'
import { PeriodoAquisitivoRepository } from './periodo-aquisitivo.repository.js'

const FUNCIONARIO_ID = '00000000-0000-0000-0000-000000000abc'
const CODIGO_FUN = 'FUN12345678900'

const DIA = 24 * 60 * 60 * 1000

describe('PeriodoAquisitivoRepository (integration, mongo real)', () => {
  let mongo: MongoHarness
  let repo: PeriodoAquisitivoRepository

  beforeAll(async () => {
    mongo = await startMongoHarness()
    repo = new PeriodoAquisitivoRepository(mongo.db)
  }, 90_000)

  afterAll(async () => {
    await mongo.stop()
  })

  beforeEach(async () => {
    await mongo.reset()
  })

  it('create() calcula dataFim e dataLimiteGozo, define EM_CURSO para período corrente', async () => {
    const dataInicio = new Date(Date.now() - 30 * DIA) // 30 dias atrás
    const p = await repo.create({
      funcionarioId: FUNCIONARIO_ID,
      codigoFun: CODIGO_FUN,
      dataInicio,
    })

    expect(p.diasDevidos).toBe(30)
    expect(p.diasGozados).toBe(0)
    expect(p.saldoDias).toBe(30)
    expect(p.status).toBe('EM_CURSO')

    // dataFim ~= dataInicio + 12 meses, dataLimiteGozo ~= dataFim + 12 meses
    expect(p.dataFim.getTime()).toBeGreaterThan(p.dataInicio.getTime())
    expect(p.dataLimiteGozo.getTime()).toBeGreaterThan(p.dataFim.getTime())
  })

  it('create() já maduro (dataInicio > 1 ano atrás) → status DISPONIVEL', async () => {
    const dataInicio = new Date(Date.now() - 400 * DIA) // 400 dias atrás
    const p = await repo.create({
      funcionarioId: FUNCIONARIO_ID,
      codigoFun: CODIGO_FUN,
      dataInicio,
    })

    expect(p.status).toBe('DISPONIVEL')
  })

  async function criarVigente(diasDevidos = 30) {
    const dataInicio = new Date(Date.now() - 400 * DIA)
    return repo.create({
      funcionarioId: FUNCIONARIO_ID,
      codigoFun: CODIGO_FUN,
      dataInicio,
      diasDevidos,
    })
  }

  it('debitarSaldo() reduz saldo, mantém DISPONIVEL/EM_GOZO se ainda há saldo', async () => {
    const p = await criarVigente()

    expect(await repo.debitarSaldo(p._id, 14, 0)).toBe(true)

    const refetch = await repo.findById(p._id)
    expect(refetch?.diasGozados).toBe(14)
    expect(refetch?.saldoDias).toBe(16)
    expect(refetch?.status).toBe('EM_GOZO')
  })

  it('debitarSaldo() zera saldo → status ENCERRADO', async () => {
    const p = await criarVigente()

    expect(await repo.debitarSaldo(p._id, 20, 10)).toBe(true)
    const refetch = await repo.findById(p._id)
    expect(refetch?.saldoDias).toBe(0)
    expect(refetch?.status).toBe('ENCERRADO')
  })

  it('debitarSaldo() em ENCERRADO retorna false (filter de status atômico)', async () => {
    const p = await criarVigente()
    await repo.debitarSaldo(p._id, 30, 0) // zera → ENCERRADO

    expect(await repo.debitarSaldo(p._id, 1, 0)).toBe(false)
  })

  it('creditarSaldo() devolve dias e pode reverter ENCERRADO → DISPONIVEL se dentro do prazo', async () => {
    const p = await criarVigente()
    await repo.debitarSaldo(p._id, 30, 0) // ENCERRADO
    expect((await repo.findById(p._id))?.status).toBe('ENCERRADO')

    expect(await repo.creditarSaldo(p._id, 14, 0)).toBe(true)
    const refetch = await repo.findById(p._id)
    expect(refetch?.diasGozados).toBe(16)
    expect(refetch?.saldoDias).toBe(14)
    expect(refetch?.status).toBe('DISPONIVEL')
  })

  it('creditarSaldo() não permite ficar negativo (Math.max(0, ...))', async () => {
    const p = await criarVigente()
    // Crédito sem prévio débito — não fica negativo
    expect(await repo.creditarSaldo(p._id, 100, 50)).toBe(true)
    const refetch = await repo.findById(p._id)
    expect(refetch?.diasGozados).toBe(0)
    expect(refetch?.diasVendidos).toBe(0)
  })

  it('atualizarStatus() é atômica com filter de from', async () => {
    const p = await criarVigente()

    expect(await repo.atualizarStatus(p._id, 'DISPONIVEL', 'EM_GOZO')).toBe(true)
    expect(await repo.atualizarStatus(p._id, 'DISPONIVEL', 'ENCERRADO')).toBe(false) // já não está DISPONIVEL
    expect((await repo.findById(p._id))?.status).toBe('EM_GOZO')
  })

  it('findVigentePorFuncionario() retorna mais recente DISPONIVEL ou EM_GOZO', async () => {
    const antigo = await repo.create({
      funcionarioId: FUNCIONARIO_ID,
      codigoFun: CODIGO_FUN,
      dataInicio: new Date(Date.now() - 800 * DIA),
    })
    await repo.atualizarStatus(antigo._id, antigo.status, 'ENCERRADO')

    const recente = await criarVigente() // DISPONIVEL

    const vigente = await repo.findVigentePorFuncionario(FUNCIONARIO_ID)
    expect(vigente?._id.toHexString()).toBe(recente._id.toHexString())
  })

  it('findVigentePorFuncionario() retorna null se só há períodos não-vigentes', async () => {
    const p = await criarVigente()
    await repo.atualizarStatus(p._id, 'DISPONIVEL', 'ENCERRADO')

    expect(await repo.findVigentePorFuncionario(FUNCIONARIO_ID)).toBeNull()
  })

  it('listPorFuncionario() ordena por dataInicio desc', async () => {
    const p1 = await repo.create({
      funcionarioId: FUNCIONARIO_ID,
      codigoFun: CODIGO_FUN,
      dataInicio: new Date(Date.now() - 800 * DIA),
    })
    const p2 = await repo.create({
      funcionarioId: FUNCIONARIO_ID,
      codigoFun: CODIGO_FUN,
      dataInicio: new Date(Date.now() - 400 * DIA),
    })

    const list = await repo.listPorFuncionario(FUNCIONARIO_ID)
    expect(list).toHaveLength(2)
    expect(list[0]!._id.toHexString()).toBe(p2._id.toHexString()) // mais recente primeiro
    expect(list[1]!._id.toHexString()).toBe(p1._id.toHexString())
  })

  it('listarParaPromoverDisponivel() encontra EM_CURSO com dataFim <= hoje', async () => {
    // EM_CURSO mas dataFim já passou
    const dataInicio = new Date(Date.now() - 400 * DIA)
    const p = await repo.create({
      funcionarioId: FUNCIONARIO_ID,
      codigoFun: CODIGO_FUN,
      dataInicio,
    })
    // create promoveu pra DISPONIVEL — força EM_CURSO
    await repo.atualizarStatus(p._id, 'DISPONIVEL', 'EM_CURSO')

    const result = await repo.listarParaPromoverDisponivel(new Date())
    expect(result.some((x) => x._id.toHexString() === p._id.toHexString())).toBe(true)
  })

  it('listarVencidos() encontra dataLimiteGozo < hoje em status ativo', async () => {
    // Período cuja dataLimiteGozo já passou: dataInicio 25 meses atrás
    const dataInicio = new Date(Date.now() - 750 * DIA)
    const p = await repo.create({
      funcionarioId: FUNCIONARIO_ID,
      codigoFun: CODIGO_FUN,
      dataInicio,
    })

    const result = await repo.listarVencidos(new Date())
    expect(result.some((x) => x._id.toHexString() === p._id.toHexString())).toBe(true)
  })

  it('listarVencendoEm() encontra apenas a janela de 1 dia X dias à frente', async () => {
    // Insere manualmente — `create()` usa aritmética de mês calendar que
    // dificulta precisão de 1-day window. Aqui controlamos dataLimiteGozo
    // exata para validar o filtro de range do método.
    const hoje = new Date()
    const dataLimiteGozo = new Date(hoje.getTime() + 30 * DIA + 1 * 60 * 60 * 1000) // 30d + 1h
    await mongo.db.collection('periodos_aquisitivos').insertOne({
      funcionarioId: FUNCIONARIO_ID,
      codigoFun: CODIGO_FUN,
      dataInicio: new Date(dataLimiteGozo.getTime() - 720 * DIA),
      dataFim: new Date(dataLimiteGozo.getTime() - 360 * DIA),
      dataLimiteGozo,
      diasDevidos: 30,
      diasGozados: 0,
      diasVendidos: 0,
      saldoDias: 30,
      status: 'DISPONIVEL',
      createdAt: hoje,
      updatedAt: hoje,
    })

    const result = await repo.listarVencendoEm(hoje, 30)
    expect(result).toHaveLength(1)
    expect(result[0]!.funcionarioId).toBe(FUNCIONARIO_ID)

    // 60 dias à frente — não encontra (fora da janela)
    expect(await repo.listarVencendoEm(hoje, 60)).toHaveLength(0)
  })
})
