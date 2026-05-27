import { ObjectId } from 'mongodb'
import { describe, expect, it } from 'vitest'

import {
  FakeAuditoriaRepository,
  FakeContadorRepository,
  FakePeriodoAquisitivoRepository,
  FakePeriodoGozoRepository,
  FakeSolicitacaoFeriasRepository,
} from '../../../test/fakes.js'
import {
  CODIGO_FUN_DEFAULT,
  FUNCIONARIO_ID_DEFAULT,
  makePeriodoAquisitivo,
  makePeriodoGozo,
  makeSolicitacao,
} from '../../../test/factories.js'
import { InMemoryEventPublisher } from '../../../test/in-memory-event-publisher.js'
import {
  AbonoInvalidoError,
  AntecedenciaInsuficienteError,
  CancelamentoInvalidoError,
  FracionamentoExcedidoError,
  JustificativaObrigatoriaError,
  PeriodoAquisitivoNaoEncontradoError,
  PeriodoMinimoInvalidoError,
  SaldoInsuficienteError,
  SolicitacaoNaoEncontradaError,
  SolicitacaoNaoPendenteError,
} from '../domain/errors/domain-error.js'
import type { AuditoriaRepository } from '../repositories/auditoria.repository.js'
import type { ContadorRepository } from '../repositories/contador.repository.js'
import type { PeriodoAquisitivoRepository } from '../repositories/periodo-aquisitivo.repository.js'
import type { PeriodoGozoRepository } from '../repositories/periodo-gozo.repository.js'
import type { SolicitacaoFeriasRepository } from '../repositories/solicitacao-ferias.repository.js'
import { AuditoriaService } from './auditoria.service.js'
import { PeriodoAquisitivoService } from './periodo-aquisitivo.service.js'
import { SolicitacaoFeriasService } from './solicitacao-ferias.service.js'

interface Harness {
  service: SolicitacaoFeriasService
  solicRepo: FakeSolicitacaoFeriasRepository
  aquisitivoRepo: FakePeriodoAquisitivoRepository
  gozoRepo: FakePeriodoGozoRepository
  contadorRepo: FakeContadorRepository
  audRepo: FakeAuditoriaRepository
  events: InMemoryEventPublisher
}

function buildService(): Harness {
  const solicRepo = new FakeSolicitacaoFeriasRepository()
  const aquisitivoRepo = new FakePeriodoAquisitivoRepository()
  const gozoRepo = new FakePeriodoGozoRepository()
  const contadorRepo = new FakeContadorRepository()
  const audRepo = new FakeAuditoriaRepository()
  const events = new InMemoryEventPublisher()
  const auditoria = new AuditoriaService(audRepo as unknown as AuditoriaRepository)
  const aquisitivoService = new PeriodoAquisitivoService(
    aquisitivoRepo as unknown as PeriodoAquisitivoRepository,
    events,
  )
  const service = new SolicitacaoFeriasService(
    solicRepo as unknown as SolicitacaoFeriasRepository,
    aquisitivoRepo as unknown as PeriodoAquisitivoRepository,
    gozoRepo as unknown as PeriodoGozoRepository,
    contadorRepo as unknown as ContadorRepository,
    aquisitivoService,
    auditoria,
    events,
  )
  return { service, solicRepo, aquisitivoRepo, gozoRepo, contadorRepo, audRepo, events }
}

// Datas relativas a um "hoje" fixo nos testes — evita flakiness com new Date().
// O service captura `new Date()` internamente em `criar` (passa pra clt-rules.hoje),
// então tudo precisa ser ancorado no presente real do teste.
const HOJE = new Date()
const DATA_INICIO_VALIDA = new Date(HOJE.getTime() + 45 * 24 * 60 * 60 * 1000)

function ajustarParaNaoCairEmVesperaDeDomingo(d: Date): Date {
  // dom = 0, sáb = 6. Vedação: 2 dias seguintes ao início não podem ser domingo.
  // Se início é sex/sab → próximo é sáb/dom → bloqueia. Mover pra segunda.
  const x = new Date(d.getTime())
  while (x.getUTCDay() === 5 || x.getUTCDay() === 6 || x.getUTCDay() === 0) {
    x.setUTCDate(x.getUTCDate() + 1)
  }
  return x
}

const DATA_INICIO_LIMPA = ajustarParaNaoCairEmVesperaDeDomingo(DATA_INICIO_VALIDA)
const DATA_FIM_LIMPA = new Date(DATA_INICIO_LIMPA.getTime() + 13 * 24 * 60 * 60 * 1000)

describe('SolicitacaoFeriasService', () => {
  describe('criar', () => {
    it('cria solicitação, gera código FER sequencial, registra audit e publica FeriasSolicitadas', async () => {
      const h = buildService()
      h.aquisitivoRepo.insertSeed(makePeriodoAquisitivo({ status: 'DISPONIVEL' }))

      const result = await h.service.criar({
        funcionarioId: FUNCIONARIO_ID_DEFAULT,
        dataInicio: DATA_INICIO_LIMPA,
        dataFim: DATA_FIM_LIMPA,
        abonoPecuniario: false,
        diasAbono: 0,
        solicitadoPor: 'usuario-1',
      })

      expect(result.codigo).toBe('FER000001')
      expect(result.codigoFun).toBe(CODIGO_FUN_DEFAULT)
      expect(result.diasSolicitados).toBe(14)
      expect(result.status).toBe('PENDENTE')

      expect(h.solicRepo.docs.size).toBe(1)
      expect(h.audRepo.docs[0]!).toMatchObject({
        acao: 'FERIAS_SOLICITADAS',
        usuarioId: 'usuario-1',
      })
      const solicitadas = h.events.byType('FeriasSolicitadas')
      expect(solicitadas).toHaveLength(1)
      expect(solicitadas[0]!.payload).toMatchObject({
        codigo: 'FER000001',
        diasSolicitados: 14,
      })
    })

    it('sequência cresce: segunda solicitação vira FER000002', async () => {
      const h = buildService()
      const aquisitivo = makePeriodoAquisitivo({ status: 'DISPONIVEL', diasDevidos: 30 })
      h.aquisitivoRepo.insertSeed(aquisitivo)

      await h.service.criar({
        funcionarioId: FUNCIONARIO_ID_DEFAULT,
        dataInicio: DATA_INICIO_LIMPA,
        dataFim: DATA_FIM_LIMPA,
        abonoPecuniario: false,
        diasAbono: 0,
        solicitadoPor: 'usuario-1',
      })
      const segundo = await h.service.criar({
        funcionarioId: FUNCIONARIO_ID_DEFAULT,
        dataInicio: DATA_INICIO_LIMPA,
        dataFim: new Date(DATA_INICIO_LIMPA.getTime() + 6 * 24 * 60 * 60 * 1000),
        abonoPecuniario: false,
        diasAbono: 0,
        solicitadoPor: 'usuario-1',
      })

      expect(segundo.codigo).toBe('FER000002')
    })

    it('falha quando não há período aquisitivo vigente', async () => {
      const h = buildService()
      await expect(
        h.service.criar({
          funcionarioId: 'sem-aquisitivo',
          dataInicio: DATA_INICIO_LIMPA,
          dataFim: DATA_FIM_LIMPA,
          abonoPecuniario: false,
          diasAbono: 0,
          solicitadoPor: 'usuario-1',
        }),
      ).rejects.toBeInstanceOf(PeriodoAquisitivoNaoEncontradoError)
    })

    it('falha quando saldo é insuficiente', async () => {
      const h = buildService()
      h.aquisitivoRepo.insertSeed(
        makePeriodoAquisitivo({ status: 'DISPONIVEL', diasDevidos: 30, saldoDias: 5 }),
      )
      await expect(
        h.service.criar({
          funcionarioId: FUNCIONARIO_ID_DEFAULT,
          dataInicio: DATA_INICIO_LIMPA,
          dataFim: DATA_FIM_LIMPA,
          abonoPecuniario: false,
          diasAbono: 0,
          solicitadoPor: 'usuario-1',
        }),
      ).rejects.toBeInstanceOf(SaldoInsuficienteError)
      // Não consumiu sequência? proximoValor só é chamado depois da validação.
      // Verificamos via não ter solicitação criada.
      expect(h.solicRepo.docs.size).toBe(0)
    })

    it('falha com PeriodoVencidoError em aquisitivo VENCIDO — mas o findVigente ignora VENCIDO, então cai em PeriodoAquisitivoNaoEncontrado', async () => {
      const h = buildService()
      h.aquisitivoRepo.insertSeed(makePeriodoAquisitivo({ status: 'VENCIDO' }))
      // Pelo design atual, VENCIDO não é "vigente" — então o caller nem chega na
      // validação de PeriodoVencidoError. Documentando o comportamento real:
      await expect(
        h.service.criar({
          funcionarioId: FUNCIONARIO_ID_DEFAULT,
          dataInicio: DATA_INICIO_LIMPA,
          dataFim: DATA_FIM_LIMPA,
          abonoPecuniario: false,
          diasAbono: 0,
          solicitadoPor: 'usuario-1',
        }),
      ).rejects.toBeInstanceOf(PeriodoAquisitivoNaoEncontradoError)
    })

    it('falha com FracionamentoExcedidoError quando já há 3 frações', async () => {
      const h = buildService()
      const aquisitivo = makePeriodoAquisitivo({ status: 'DISPONIVEL' })
      h.aquisitivoRepo.insertSeed(aquisitivo)
      for (let i = 0; i < 3; i++) {
        h.solicRepo.insertSeed(
          makeSolicitacao({
            periodoAquisitivoId: aquisitivo._id,
            status: 'APROVADA',
          }),
        )
      }
      await expect(
        h.service.criar({
          funcionarioId: FUNCIONARIO_ID_DEFAULT,
          dataInicio: DATA_INICIO_LIMPA,
          dataFim: new Date(DATA_INICIO_LIMPA.getTime() + 4 * 24 * 60 * 60 * 1000),
          abonoPecuniario: false,
          diasAbono: 0,
          solicitadoPor: 'usuario-1',
        }),
      ).rejects.toBeInstanceOf(FracionamentoExcedidoError)
    })

    it('falha com PeriodoMinimoInvalidoError quando dias < 14 na primeira fração', async () => {
      const h = buildService()
      h.aquisitivoRepo.insertSeed(makePeriodoAquisitivo({ status: 'DISPONIVEL' }))
      await expect(
        h.service.criar({
          funcionarioId: FUNCIONARIO_ID_DEFAULT,
          dataInicio: DATA_INICIO_LIMPA,
          dataFim: new Date(DATA_INICIO_LIMPA.getTime() + 6 * 24 * 60 * 60 * 1000), // 7 dias
          abonoPecuniario: false,
          diasAbono: 0,
          solicitadoPor: 'usuario-1',
        }),
      ).rejects.toBeInstanceOf(PeriodoMinimoInvalidoError)
    })

    it('falha com AntecedenciaInsuficienteError quando início < 30 dias', async () => {
      const h = buildService()
      h.aquisitivoRepo.insertSeed(makePeriodoAquisitivo({ status: 'DISPONIVEL' }))
      const proximo = ajustarParaNaoCairEmVesperaDeDomingo(
        new Date(HOJE.getTime() + 5 * 24 * 60 * 60 * 1000),
      )
      await expect(
        h.service.criar({
          funcionarioId: FUNCIONARIO_ID_DEFAULT,
          dataInicio: proximo,
          dataFim: new Date(proximo.getTime() + 13 * 24 * 60 * 60 * 1000),
          abonoPecuniario: false,
          diasAbono: 0,
          solicitadoPor: 'usuario-1',
        }),
      ).rejects.toBeInstanceOf(AntecedenciaInsuficienteError)
    })

    it('aceita abono pecuniário válido (1–10 dias, antecedência >= 15, saldo restante >= 20)', async () => {
      const h = buildService()
      h.aquisitivoRepo.insertSeed(
        makePeriodoAquisitivo({ status: 'DISPONIVEL', diasDevidos: 30, saldoDias: 30 }),
      )
      const result = await h.service.criar({
        funcionarioId: FUNCIONARIO_ID_DEFAULT,
        dataInicio: DATA_INICIO_LIMPA,
        dataFim: new Date(DATA_INICIO_LIMPA.getTime() + 19 * 24 * 60 * 60 * 1000), // 20 dias
        abonoPecuniario: true,
        diasAbono: 10,
        solicitadoPor: 'usuario-1',
      })
      expect(result.abonoPecuniario).toBe(true)
      expect(result.diasAbono).toBe(10)
    })

    it('rejeita abono fora do intervalo 1–10', async () => {
      const h = buildService()
      h.aquisitivoRepo.insertSeed(
        makePeriodoAquisitivo({ status: 'DISPONIVEL', diasDevidos: 30, saldoDias: 30 }),
      )
      await expect(
        h.service.criar({
          funcionarioId: FUNCIONARIO_ID_DEFAULT,
          dataInicio: DATA_INICIO_LIMPA,
          dataFim: DATA_FIM_LIMPA,
          abonoPecuniario: true,
          diasAbono: 15,
          solicitadoPor: 'usuario-1',
        }),
      ).rejects.toBeInstanceOf(AbonoInvalidoError)
    })
  })

  describe('aprovar', () => {
    it('cria PeriodoGozo, debita saldo do aquisitivo, registra audit e publica FeriasAprovadas', async () => {
      const h = buildService()
      const aquisitivo = makePeriodoAquisitivo({
        status: 'DISPONIVEL',
        diasDevidos: 30,
        saldoDias: 30,
      })
      h.aquisitivoRepo.insertSeed(aquisitivo)
      const sol = makeSolicitacao({
        periodoAquisitivoId: aquisitivo._id,
        diasSolicitados: 14,
        status: 'PENDENTE',
      })
      h.solicRepo.insertSeed(sol)

      const result = await h.service.aprovar({
        id: sol._id.toHexString(),
        aprovadoPor: 'coord-1',
        salarioBruto: 3000,
      })

      expect(result.status).toBe('APROVADA')
      expect(result.periodoGozoId).not.toBeNull()
      // PeriodoGozo criado
      expect(h.gozoRepo.docs.size).toBe(1)
      const gozo = [...h.gozoRepo.docs.values()][0]!
      expect(gozo.status).toBe('AGENDADO')
      // 3000/30 * 14 = 1400; 1/3 = 466.67
      expect(gozo.valorFerias).toBe(1400)
      expect(gozo.valorTerco).toBeCloseTo(466.67, 2)
      // Saldo debitado
      const aquisitivoAtualizado = await h.aquisitivoRepo.findById(aquisitivo._id)
      expect(aquisitivoAtualizado!.diasGozados).toBe(14)
      expect(aquisitivoAtualizado!.saldoDias).toBe(16)
      expect(aquisitivoAtualizado!.status).toBe('EM_GOZO')

      const aprovadas = h.events.byType('FeriasAprovadas')
      expect(aprovadas).toHaveLength(1)
      expect(aprovadas[0]!.payload.solicitacaoId).toBe(sol._id.toHexString())
      expect(h.audRepo.docs[0]!.acao).toBe('FERIAS_APROVADAS')
    })

    it('falha com SolicitacaoNaoEncontradaError quando id não existe', async () => {
      const h = buildService()
      await expect(
        h.service.aprovar({
          id: new ObjectId().toHexString(),
          aprovadoPor: 'coord-1',
          salarioBruto: 3000,
        }),
      ).rejects.toBeInstanceOf(SolicitacaoNaoEncontradaError)
    })

    it('falha com SolicitacaoNaoPendenteError quando já aprovada', async () => {
      const h = buildService()
      const aquisitivo = makePeriodoAquisitivo({ status: 'DISPONIVEL' })
      h.aquisitivoRepo.insertSeed(aquisitivo)
      const sol = makeSolicitacao({
        periodoAquisitivoId: aquisitivo._id,
        status: 'APROVADA',
      })
      h.solicRepo.insertSeed(sol)
      await expect(
        h.service.aprovar({
          id: sol._id.toHexString(),
          aprovadoPor: 'coord-1',
          salarioBruto: 3000,
        }),
      ).rejects.toBeInstanceOf(SolicitacaoNaoPendenteError)
    })

    it('rollback do gozo quando race condition impede a aprovação no repo', async () => {
      const h = buildService()
      const aquisitivo = makePeriodoAquisitivo({ status: 'DISPONIVEL' })
      h.aquisitivoRepo.insertSeed(aquisitivo)
      const sol = makeSolicitacao({
        periodoAquisitivoId: aquisitivo._id,
        status: 'PENDENTE',
      })
      h.solicRepo.insertSeed(sol)

      // Hook: ao chamar aprovar(), forçamos status já APROVADA antes do UPDATE.
      // Simula o cenário em que outro aprovador venceu a corrida.
      const aprovarOriginal = h.solicRepo.aprovar.bind(h.solicRepo)
      h.solicRepo.aprovar = async (...args) => {
        const key = typeof args[0] === 'string' ? args[0] : args[0].toHexString()
        const doc = h.solicRepo.docs.get(key)
        if (doc) {
          h.solicRepo.docs.set(key, { ...doc, status: 'APROVADA' })
        }
        return aprovarOriginal(...args)
      }

      await expect(
        h.service.aprovar({
          id: sol._id.toHexString(),
          aprovadoPor: 'coord-1',
          salarioBruto: 3000,
        }),
      ).rejects.toBeInstanceOf(SolicitacaoNaoPendenteError)
      // Gozo recém-criado deve ter sido marcado como CANCELADO
      const gozos = [...h.gozoRepo.docs.values()]
      expect(gozos).toHaveLength(1)
      expect(gozos[0]!.status).toBe('CANCELADO')
    })
  })

  describe('rejeitar', () => {
    it('rejeita PENDENTE com justificativa, registra audit e publica FeriasRejeitadas', async () => {
      const h = buildService()
      const aquisitivo = makePeriodoAquisitivo({ status: 'DISPONIVEL' })
      h.aquisitivoRepo.insertSeed(aquisitivo)
      const sol = makeSolicitacao({ periodoAquisitivoId: aquisitivo._id, status: 'PENDENTE' })
      h.solicRepo.insertSeed(sol)

      const result = await h.service.rejeitar({
        id: sol._id.toHexString(),
        aprovadoPor: 'coord-1',
        justificativa: 'Time desfalcado no período',
      })

      expect(result.status).toBe('REJEITADA')
      expect(result.justificativaRejeicao).toBe('Time desfalcado no período')
      expect(h.events.byType('FeriasRejeitadas')).toHaveLength(1)
      expect(h.audRepo.docs[0]!.acao).toBe('FERIAS_REJEITADAS')
    })

    it('falha sem justificativa', async () => {
      const h = buildService()
      await expect(
        h.service.rejeitar({
          id: new ObjectId().toHexString(),
          aprovadoPor: 'coord-1',
          justificativa: '',
        }),
      ).rejects.toBeInstanceOf(JustificativaObrigatoriaError)
    })

    it('falha com justificativa muito curta (< 3 chars)', async () => {
      const h = buildService()
      await expect(
        h.service.rejeitar({
          id: new ObjectId().toHexString(),
          aprovadoPor: 'coord-1',
          justificativa: 'no',
        }),
      ).rejects.toBeInstanceOf(JustificativaObrigatoriaError)
    })

    it('falha com SolicitacaoNaoPendenteError se já rejeitada', async () => {
      const h = buildService()
      const sol = makeSolicitacao({ status: 'REJEITADA' })
      h.solicRepo.insertSeed(sol)
      await expect(
        h.service.rejeitar({
          id: sol._id.toHexString(),
          aprovadoPor: 'coord-1',
          justificativa: 'tentativa duplicada',
        }),
      ).rejects.toBeInstanceOf(SolicitacaoNaoPendenteError)
    })
  })

  describe('cancelar', () => {
    it('USUARIO cancela própria PENDENTE — não credita saldo', async () => {
      const h = buildService()
      const aquisitivo = makePeriodoAquisitivo({
        status: 'DISPONIVEL',
        diasGozados: 0,
        saldoDias: 30,
      })
      h.aquisitivoRepo.insertSeed(aquisitivo)
      const sol = makeSolicitacao({
        periodoAquisitivoId: aquisitivo._id,
        solicitadoPor: 'usuario-1',
        status: 'PENDENTE',
      })
      h.solicRepo.insertSeed(sol)

      const result = await h.service.cancelar({
        id: sol._id.toHexString(),
        canceladoPor: 'usuario-1',
        motivo: 'mudei de planos',
        papelDoCallerEhAdmin: false,
      })

      expect(result.status).toBe('CANCELADA')
      const aqAtualizado = await h.aquisitivoRepo.findById(aquisitivo._id)
      expect(aqAtualizado!.saldoDias).toBe(30) // não houve débito
      expect(h.events.byType('FeriasCanceladas')).toHaveLength(1)
    })

    it('USUARIO não pode cancelar solicitação de outro', async () => {
      const h = buildService()
      const sol = makeSolicitacao({ solicitadoPor: 'usuario-1', status: 'PENDENTE' })
      h.solicRepo.insertSeed(sol)
      await expect(
        h.service.cancelar({
          id: sol._id.toHexString(),
          canceladoPor: 'usuario-2',
          motivo: 'achei melhor',
          papelDoCallerEhAdmin: false,
        }),
      ).rejects.toBeInstanceOf(CancelamentoInvalidoError)
    })

    it('USUARIO não pode cancelar solicitação APROVADA — precisa ADMIN', async () => {
      const h = buildService()
      const sol = makeSolicitacao({ solicitadoPor: 'usuario-1', status: 'APROVADA' })
      h.solicRepo.insertSeed(sol)
      await expect(
        h.service.cancelar({
          id: sol._id.toHexString(),
          canceladoPor: 'usuario-1',
          motivo: 'desisti',
          papelDoCallerEhAdmin: false,
        }),
      ).rejects.toBeInstanceOf(CancelamentoInvalidoError)
    })

    it('ADMIN cancela APROVADA — credita saldo e cancela PeriodoGozo agendado', async () => {
      const h = buildService()
      const aquisitivo = makePeriodoAquisitivo({
        status: 'EM_GOZO',
        diasGozados: 14,
        saldoDias: 16,
      })
      h.aquisitivoRepo.insertSeed(aquisitivo)
      const gozo = makePeriodoGozo({
        periodoAquisitivoId: aquisitivo._id,
        diasGozo: 14,
        status: 'AGENDADO',
      })
      h.gozoRepo.insertSeed(gozo)
      const sol = makeSolicitacao({
        periodoAquisitivoId: aquisitivo._id,
        periodoGozoId: gozo._id,
        diasSolicitados: 14,
        status: 'APROVADA',
      })
      h.solicRepo.insertSeed(sol)

      const result = await h.service.cancelar({
        id: sol._id.toHexString(),
        canceladoPor: 'admin-1',
        motivo: 'reorganização da equipe',
        papelDoCallerEhAdmin: true,
      })

      expect(result.status).toBe('CANCELADA')
      const aqAtualizado = await h.aquisitivoRepo.findById(aquisitivo._id)
      expect(aqAtualizado!.diasGozados).toBe(0)
      expect(aqAtualizado!.saldoDias).toBe(30)
      expect(h.gozoRepo.docs.get(gozo._id.toHexString())?.status).toBe('CANCELADO')
    })

    it('ADMIN não pode cancelar REJEITADA', async () => {
      const h = buildService()
      const sol = makeSolicitacao({ status: 'REJEITADA' })
      h.solicRepo.insertSeed(sol)
      await expect(
        h.service.cancelar({
          id: sol._id.toHexString(),
          canceladoPor: 'admin-1',
          motivo: 'limpando histórico',
          papelDoCallerEhAdmin: true,
        }),
      ).rejects.toBeInstanceOf(CancelamentoInvalidoError)
    })
  })

  describe('queries', () => {
    it('buscarPorId retorna solicitação existente', async () => {
      const h = buildService()
      const sol = makeSolicitacao()
      h.solicRepo.insertSeed(sol)
      const result = await h.service.buscarPorId(sol._id.toHexString())
      expect(result.id).toBe(sol._id.toHexString())
    })

    it('buscarPorId lança quando id não existe', async () => {
      const h = buildService()
      await expect(h.service.buscarPorId(new ObjectId().toHexString())).rejects.toBeInstanceOf(
        SolicitacaoNaoEncontradaError,
      )
    })

    it('listar pagina e filtra por status', async () => {
      const h = buildService()
      h.solicRepo.insertSeed(makeSolicitacao({ status: 'PENDENTE', codigo: 'FER000001' }))
      h.solicRepo.insertSeed(makeSolicitacao({ status: 'APROVADA', codigo: 'FER000002' }))
      h.solicRepo.insertSeed(makeSolicitacao({ status: 'REJEITADA', codigo: 'FER000003' }))

      const result = await h.service.listar({ status: 'APROVADA' }, 1, 10)
      expect(result.total).toBe(1)
      expect(result.items[0]!.codigo).toBe('FER000002')
    })
  })
})
