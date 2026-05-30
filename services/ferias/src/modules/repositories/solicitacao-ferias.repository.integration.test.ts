/**
 * Integration test do `SolicitacaoFeriasRepository` contra Mongo real via
 * testcontainers.
 *
 * Cobre o que testes unitários com fake NÃO conseguem cobrir:
 *
 *   - índice unique `solicitacoes_codigo_unique` rejeitando duplicação real.
 *   - transições atômicas (`updateOne` com filtro de status) que dependem
 *     do comportamento de match real do Mongo para race detection
 *     entre PENDENTE → APROVADA / REJEITADA.
 *   - `cancelar()` com `statusAceitos` variável — só cancela se o status
 *     no banco estiver na lista (PENDENTE para USUARIO, ['PENDENTE','APROVADA']
 *     para ADMINISTRADOR).
 *   - `contarFracoesNoAquisitivo()` somando apenas PENDENTE + APROVADA.
 *
 * Pré-requisito: Docker disponível no host (testcontainers spinna Mongo:7).
 *
 * Comando: `pnpm --filter @hr-core/ferias test:integration`
 */
import { ObjectId } from 'mongodb'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { startMongoHarness, type MongoHarness } from '../../../test/mongo-harness.js'
import { SolicitacaoFeriasRepository } from './solicitacao-ferias.repository.js'

const FUNCIONARIO_ID = '00000000-0000-0000-0000-000000000abc'
const CODIGO_FUN = 'FUN12345678900'

describe('SolicitacaoFeriasRepository (integration, mongo real)', () => {
  let mongo: MongoHarness
  let repo: SolicitacaoFeriasRepository
  let periodoAquisitivoId: ObjectId

  beforeAll(async () => {
    mongo = await startMongoHarness()
    repo = new SolicitacaoFeriasRepository(mongo.db)
  }, 90_000)

  afterAll(async () => {
    await mongo.stop()
  })

  beforeEach(async () => {
    await mongo.reset()
    periodoAquisitivoId = new ObjectId()
  })

  async function criarPendente(codigo: string): Promise<ObjectId> {
    const sol = await repo.create({
      codigo,
      codigoFun: CODIGO_FUN,
      funcionarioId: FUNCIONARIO_ID,
      periodoAquisitivoId,
      dataInicio: new Date('2026-07-01T00:00:00Z'),
      dataFim: new Date('2026-07-14T23:59:59Z'),
      diasSolicitados: 14,
      abonoPecuniario: false,
      diasAbono: 0,
      solicitadoPor: 'user-1',
    })
    return sol._id
  }

  it('create + findById preserva todos os campos com status PENDENTE', async () => {
    const created = await repo.create({
      codigo: 'FER000001',
      codigoFun: CODIGO_FUN,
      funcionarioId: FUNCIONARIO_ID,
      periodoAquisitivoId,
      dataInicio: new Date('2026-07-01T00:00:00Z'),
      dataFim: new Date('2026-07-14T23:59:59Z'),
      diasSolicitados: 14,
      abonoPecuniario: true,
      diasAbono: 5,
      solicitadoPor: 'user-1',
    })

    expect(created.status).toBe('PENDENTE')
    expect(created.codigo).toBe('FER000001')

    const found = await repo.findById(created._id)
    expect(found?.diasSolicitados).toBe(14)
    expect(found?.abonoPecuniario).toBe(true)
    expect(found?.diasAbono).toBe(5)
    expect(found?.aprovadoPor).toBeNull()
    expect(found?.periodoGozoId).toBeNull()
  })

  it('índice unique de codigo bloqueia duplicação', async () => {
    await criarPendente('FER000001')
    await expect(criarPendente('FER000001')).rejects.toThrow()

    // Outro código → OK
    await expect(criarPendente('FER000002')).resolves.toBeDefined()
  })

  it('aprovar() é atômica — só funciona em PENDENTE', async () => {
    const id = await criarPendente('FER000001')
    const periodoGozoId = new ObjectId()

    // 1ª aprovação funciona
    const ok = await repo.aprovar(id, 'coord-1', periodoGozoId)
    expect(ok).toBe(true)

    const aprovada = await repo.findById(id)
    expect(aprovada?.status).toBe('APROVADA')
    expect(aprovada?.aprovadoPor).toBe('coord-1')
    expect(aprovada?.periodoGozoId?.toHexString()).toBe(periodoGozoId.toHexString())

    // 2ª aprovação (já APROVADA) deve retornar false sem alterar nada
    const segundaTentativa = await repo.aprovar(id, 'coord-2', new ObjectId())
    expect(segundaTentativa).toBe(false)
    const refetch = await repo.findById(id)
    expect(refetch?.aprovadoPor).toBe('coord-1') // não trocou
  })

  it('aprovar() em paralelo só permite UMA execução (race detection real)', async () => {
    const id = await criarPendente('FER000001')

    const [a, b] = await Promise.all([
      repo.aprovar(id, 'coord-a', new ObjectId()),
      repo.aprovar(id, 'coord-b', new ObjectId()),
    ])
    expect([a, b].filter(Boolean)).toHaveLength(1)
  })

  it('rejeitar() exige PENDENTE — não funciona após APROVADA', async () => {
    const id = await criarPendente('FER000001')
    await repo.aprovar(id, 'coord-1', new ObjectId())

    const rejeitou = await repo.rejeitar(id, 'coord-2', 'tentando reverter')
    expect(rejeitou).toBe(false)
    expect((await repo.findById(id))?.status).toBe('APROVADA')
  })

  it('cancelar() com statusAceitos restrito — USUARIO só cancela PENDENTE', async () => {
    const id = await criarPendente('FER000001')

    // Usuário (statusAceitos = ['PENDENTE']) consegue cancelar enquanto está PENDENTE
    const ok = await repo.cancelar(id, FUNCIONARIO_ID, 'desistência', ['PENDENTE'])
    expect(ok).toBe(true)
    expect((await repo.findById(id))?.status).toBe('CANCELADA')

    // Aprovada não pode ser cancelada por USUARIO
    const id2 = await criarPendente('FER000002')
    await repo.aprovar(id2, 'coord-1', new ObjectId())
    const naoCancelou = await repo.cancelar(id2, FUNCIONARIO_ID, 'tarde demais', ['PENDENTE'])
    expect(naoCancelou).toBe(false)
  })

  it('cancelar() com statusAceitos amplo — ADMINISTRADOR cancela qualquer ativa', async () => {
    const id = await criarPendente('FER000001')
    await repo.aprovar(id, 'coord-1', new ObjectId())

    // ADMIN pode cancelar mesmo APROVADA
    const ok = await repo.cancelar(id, 'admin-1', 'erro operacional', ['PENDENTE', 'APROVADA'])
    expect(ok).toBe(true)
    expect((await repo.findById(id))?.status).toBe('CANCELADA')
  })

  it('contarFracoesNoAquisitivo() inclui PENDENTE e APROVADA, exclui canceladas/rejeitadas', async () => {
    const id1 = await criarPendente('FER000001')
    const id2 = await criarPendente('FER000002')
    const id3 = await criarPendente('FER000003')
    await criarPendente('FER000004') // fica PENDENTE — conta

    await repo.aprovar(id1, 'coord-1', new ObjectId()) // APROVADA — conta
    await repo.rejeitar(id2, 'coord-1', 'fora de prazo') // REJEITADA — não conta
    await repo.cancelar(id3, 'user-1', 'desistência', ['PENDENTE']) // CANCELADA — não conta

    expect(await repo.contarFracoesNoAquisitivo(periodoAquisitivoId)).toBe(2)
  })

  it('list() com filtros e paginação', async () => {
    for (let i = 1; i <= 5; i++) {
      await criarPendente(`FER00000${i}`)
    }
    // Aprova 2
    const todas = await repo.list({}, 1, 20)
    await repo.aprovar(todas.items[0]!._id, 'coord-1', new ObjectId())
    await repo.aprovar(todas.items[1]!._id, 'coord-1', new ObjectId())

    const apenasPendentes = await repo.list({ status: 'PENDENTE' }, 1, 20)
    expect(apenasPendentes.total).toBe(3)

    const apenasAprovadas = await repo.list({ status: 'APROVADA' }, 1, 20)
    expect(apenasAprovadas.total).toBe(2)

    // Paginação 2 por página → 3 páginas
    const page1 = await repo.list({}, 1, 2)
    expect(page1.items).toHaveLength(2)
    expect(page1.pages).toBe(3)
  })
})
