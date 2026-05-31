/**
 * Integration test do `FolhaRepository` contra Mongo real via testcontainers.
 *
 * Exemplar para os demais repositories (e demais services). Cobre o que
 * testes unitários com fake NÃO conseguem cobrir:
 *
 *   - índices unique do Mongo (`folhas_funcionario_tipo_competencia_unique`)
 *     emitindo `MongoServerError code 11000` mapeado para
 *     `FolhaCompetenciaDuplicadaError`.
 *   - transições atômicas (`updateOne` com filtro de status) que dependem
 *     do comportamento de match real do Mongo para race detection.
 *   - paginação real com `skip`+`limit`+`countDocuments`.
 *
 * Pré-requisito: Docker disponível no host (testcontainers spinna Mongo:7).
 *
 * Comando: `pnpm --filter @hr-core/folha-pagamento test:integration`
 */
import { type ObjectId } from 'mongodb'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { startMongoHarness, type MongoHarness } from '../../../test/mongo-harness.js'
import { FolhaCompetenciaDuplicadaError } from '../domain/errors/domain-error.js'
import { FolhaRepository } from './folha.repository.js'

describe('FolhaRepository (integration, mongo real)', () => {
  let mongo: MongoHarness
  let repo: FolhaRepository

  beforeAll(async () => {
    mongo = await startMongoHarness()
    repo = new FolhaRepository(mongo.db)
  }, 90_000)

  afterAll(async () => {
    await mongo.stop()
  })

  beforeEach(async () => {
    await mongo.reset()
  })

  it('create + findById preserva todos os campos', async () => {
    const created = await repo.create({
      codigo: 'FOLHA000001',
      codigoFun: 'FUN12345678900',
      funcionarioId: 'fid-1',
      tipo: 'MENSAL',
      competencia: '2026-05',
      salarioBase: 5_000,
      numeroDependentes: 1,
      abertaPor: 'coord-1',
    })

    expect(created.codigo).toBe('FOLHA000001')
    expect(created.status).toBe('ABERTA')

    const found = await repo.findById(created._id)
    expect(found?.codigo).toBe('FOLHA000001')
    expect(found?.salarioBase).toBe(5_000)
    expect(found?.numeroDependentes).toBe(1)
  })

  it('índice unique de (funcionarioId, tipo, competencia) lança FolhaCompetenciaDuplicadaError', async () => {
    await repo.create({
      codigo: 'FOLHA000001',
      codigoFun: 'FUN12345678900',
      funcionarioId: 'fid-1',
      tipo: 'MENSAL',
      competencia: '2026-05',
      salarioBase: 5_000,
      numeroDependentes: 0,
      abertaPor: 'coord-1',
    })

    // Mesma tupla (funcionarioId, tipo, competencia) — esperado 409
    await expect(
      repo.create({
        codigo: 'FOLHA000002',
        codigoFun: 'FUN12345678900',
        funcionarioId: 'fid-1',
        tipo: 'MENSAL',
        competencia: '2026-05',
        salarioBase: 5_000,
        numeroDependentes: 0,
        abertaPor: 'coord-2',
      }),
    ).rejects.toThrow(FolhaCompetenciaDuplicadaError)

    // Trocar a competência libera a inserção
    await expect(
      repo.create({
        codigo: 'FOLHA000003',
        codigoFun: 'FUN12345678900',
        funcionarioId: 'fid-1',
        tipo: 'MENSAL',
        competencia: '2026-06',
        salarioBase: 5_000,
        numeroDependentes: 0,
        abertaPor: 'coord-1',
      }),
    ).resolves.toBeDefined()
  })

  it('índice unique de codigo (FOLHA) bloqueia duplicação independente do funcionário', async () => {
    await repo.create({
      codigo: 'FOLHA000001',
      codigoFun: 'FUN11111111111',
      funcionarioId: 'fid-1',
      tipo: 'MENSAL',
      competencia: '2026-05',
      salarioBase: 5_000,
      numeroDependentes: 0,
      abertaPor: 'coord-1',
    })

    // Mesmo código com OUTRO funcionário/competência — esperado erro de unique
    await expect(
      repo.create({
        codigo: 'FOLHA000001',
        codigoFun: 'FUN22222222222',
        funcionarioId: 'fid-2',
        tipo: 'MENSAL',
        competencia: '2026-06',
        salarioBase: 4_000,
        numeroDependentes: 0,
        abertaPor: 'coord-1',
      }),
    ).rejects.toThrow()
  })

  it('aprovar() é atômica — só funciona em folha PROCESSADA', async () => {
    const folha = await repo.create({
      codigo: 'FOLHA000001',
      codigoFun: 'FUN12345678900',
      funcionarioId: 'fid-1',
      tipo: 'MENSAL',
      competencia: '2026-05',
      salarioBase: 5_000,
      numeroDependentes: 0,
      abertaPor: 'coord-1',
    })

    // Folha está em ABERTA — aprovar deve falhar (false), sem modificar nada
    const okAberta = await repo.aprovar(folha._id, 'coord-2')
    expect(okAberta).toBe(false)
    expect((await repo.findById(folha._id))?.status).toBe('ABERTA')

    // Processa e aí aprovar deve funcionar
    await repo.processar(folha._id, {
      proventos: [],
      descontos: [],
      totalProventos: 5_000,
      totalDescontos: 0,
      salarioLiquido: 5_000,
      descontoINSS: 0,
      descontoIRRF: 0,
      fgts: 400,
      processadaPor: 'coord-1',
    })

    const okProcessada = await repo.aprovar(folha._id, 'coord-2')
    expect(okProcessada).toBe(true)

    const aprovada = await repo.findById(folha._id)
    expect(aprovada?.status).toBe('APROVADA')
    expect(aprovada?.aprovadaPor).toBe('coord-2')
    expect(aprovada?.aprovadaEm).toBeInstanceOf(Date)
  })

  it('aprovar() em paralelo só permite UMA execução (race detection real)', async () => {
    // Cria duas folhas processadas
    const ids: ObjectId[] = []
    for (let i = 1; i <= 2; i++) {
      const f = await repo.create({
        codigo: `FOLHA00000${i}`,
        codigoFun: `FUN${String(i).padStart(11, '0')}`,
        funcionarioId: `fid-${i}`,
        tipo: 'MENSAL',
        competencia: '2026-05',
        salarioBase: 5_000,
        numeroDependentes: 0,
        abertaPor: 'coord-1',
      })
      await repo.processar(f._id, {
        proventos: [],
        descontos: [],
        totalProventos: 5_000,
        totalDescontos: 0,
        salarioLiquido: 5_000,
        descontoINSS: 0,
        descontoIRRF: 0,
        fgts: 400,
        processadaPor: 'coord-1',
      })
      ids.push(f._id)
    }

    // Duas chamadas em paralelo para a MESMA folha — só uma deve retornar true.
    const [a, b] = await Promise.all([
      repo.aprovar(ids[0]!, 'coord-a'),
      repo.aprovar(ids[0]!, 'coord-b'),
    ])
    expect([a, b].filter(Boolean)).toHaveLength(1)
  })

  it('list() com filtros e paginação', async () => {
    // Cria 5 folhas: 3 MENSAL e 2 ADIANTAMENTO para o mesmo funcionário
    for (let i = 1; i <= 3; i++) {
      await repo.create({
        codigo: `FOLHA00000${i}`,
        codigoFun: 'FUN12345678900',
        funcionarioId: 'fid-1',
        tipo: 'MENSAL',
        competencia: `2026-0${i}`,
        salarioBase: 5_000,
        numeroDependentes: 0,
        abertaPor: 'coord-1',
      })
    }
    for (let i = 4; i <= 5; i++) {
      await repo.create({
        codigo: `FOLHA00000${i}`,
        codigoFun: 'FUN12345678900',
        funcionarioId: 'fid-1',
        tipo: 'ADIANTAMENTO',
        competencia: `2026-0${i - 3}`,
        salarioBase: 5_000,
        numeroDependentes: 0,
        abertaPor: 'coord-1',
      })
    }

    const todas = await repo.list({ codigoFun: 'FUN12345678900' }, 1, 20)
    expect(todas.total).toBe(5)

    const apenasMensal = await repo.list({ tipo: 'MENSAL' }, 1, 20)
    expect(apenasMensal.total).toBe(3)
    expect(apenasMensal.items.every((f) => f.tipo === 'MENSAL')).toBe(true)

    // Paginação 2 por página
    const page1 = await repo.list({}, 1, 2)
    expect(page1.items).toHaveLength(2)
    expect(page1.pages).toBe(3)
  })

  it('list() com todos os filtros simultaneamente combina query', async () => {
    await repo.create({
      codigo: 'FOLHA000001',
      codigoFun: 'FUN12345678900',
      funcionarioId: 'fid-1',
      tipo: 'MENSAL',
      competencia: '2026-05',
      salarioBase: 5_000,
      numeroDependentes: 0,
      abertaPor: 'coord-1',
    })
    await repo.create({
      codigo: 'FOLHA000002',
      codigoFun: 'FUN12345678900',
      funcionarioId: 'fid-1',
      tipo: 'MENSAL',
      competencia: '2026-06',
      salarioBase: 5_000,
      numeroDependentes: 0,
      abertaPor: 'coord-1',
    })

    // Filtro combinado funcionarioId + tipo + competencia + status
    const result = await repo.list(
      {
        funcionarioId: 'fid-1',
        codigoFun: 'FUN12345678900',
        tipo: 'MENSAL',
        competencia: '2026-05',
        status: 'ABERTA',
      },
      1,
      20,
    )
    expect(result.total).toBe(1)
    expect(result.items[0]!.competencia).toBe('2026-05')
  })

  it('findByCodigo() retorna match ou null', async () => {
    await repo.create({
      codigo: 'FOLHA000001',
      codigoFun: 'FUN12345678900',
      funcionarioId: 'fid-1',
      tipo: 'MENSAL',
      competencia: '2026-05',
      salarioBase: 5_000,
      numeroDependentes: 0,
      abertaPor: 'coord-1',
    })

    expect((await repo.findByCodigo('FOLHA000001'))?.codigo).toBe('FOLHA000001')
    expect(await repo.findByCodigo('FOLHA000999')).toBeNull()
  })

  it('findByFuncionarioCompetencia() filtra pelo tripé (codigoFun, tipo, competencia)', async () => {
    await repo.create({
      codigo: 'FOLHA000001',
      codigoFun: 'FUN12345678900',
      funcionarioId: 'fid-1',
      tipo: 'MENSAL',
      competencia: '2026-05',
      salarioBase: 5_000,
      numeroDependentes: 0,
      abertaPor: 'coord-1',
    })

    // Match completo
    const found = await repo.findByFuncionarioCompetencia('FUN12345678900', 'MENSAL', '2026-05')
    expect(found?.codigo).toBe('FOLHA000001')

    // Sem match para tipo diferente
    expect(
      await repo.findByFuncionarioCompetencia('FUN12345678900', 'ADIANTAMENTO', '2026-05'),
    ).toBeNull()

    // Sem match para competência diferente
    expect(
      await repo.findByFuncionarioCompetencia('FUN12345678900', 'MENSAL', '2026-06'),
    ).toBeNull()
  })

  it('reabrir() permite folha REJEITADA voltar para ABERTA', async () => {
    const folha = await repo.create({
      codigo: 'FOLHA000001',
      codigoFun: 'FUN12345678900',
      funcionarioId: 'fid-1',
      tipo: 'MENSAL',
      competencia: '2026-05',
      salarioBase: 5_000,
      numeroDependentes: 0,
      abertaPor: 'coord-1',
    })
    // ABERTA → PROCESSADA → REJEITADA
    await repo.processar(folha._id, {
      proventos: [],
      descontos: [],
      totalProventos: 5_000,
      totalDescontos: 0,
      salarioLiquido: 5_000,
      descontoINSS: 0,
      descontoIRRF: 0,
      fgts: 400,
      processadaPor: 'coord-1',
    })
    await repo.rejeitar(folha._id, 'coord-2', 'falta verba')

    // Reabre — REJEITADA → ABERTA
    expect(await repo.reabrir(folha._id)).toBe(true)
    expect((await repo.findById(folha._id))?.status).toBe('ABERTA')
  })

  it('reabrir() em folha NÃO-REJEITADA retorna false (filter atômico)', async () => {
    const folha = await repo.create({
      codigo: 'FOLHA000001',
      codigoFun: 'FUN12345678900',
      funcionarioId: 'fid-1',
      tipo: 'MENSAL',
      competencia: '2026-05',
      salarioBase: 5_000,
      numeroDependentes: 0,
      abertaPor: 'coord-1',
    })

    // Folha está ABERTA — reabrir não funciona (já não está REJEITADA)
    expect(await repo.reabrir(folha._id)).toBe(false)
    expect((await repo.findById(folha._id))?.status).toBe('ABERTA')
  })
})
