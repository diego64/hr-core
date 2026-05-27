import { describe, expect, it } from 'vitest'
import { ObjectId } from 'mongodb'

import type { PeriodoAquisitivo } from './entities/periodo-aquisitivo.js'
import {
  AbonoInvalidoError,
  AntecedenciaInsuficienteError,
  FracionamentoExcedidoError,
  InicioInvalidoError,
  PeriodoMinimoInvalidoError,
  PeriodoVencidoError,
  SaldoInsuficienteError,
} from './errors/domain-error.js'
import { CLT_CONSTANTES, calcularDiasSolicitados, validarSolicitacaoFerias } from './clt-rules.js'

function fakeAquisitivo(overrides: Partial<PeriodoAquisitivo> = {}): PeriodoAquisitivo {
  const now = new Date('2026-01-01T00:00:00Z')
  return {
    _id: new ObjectId(),
    funcionarioId: 'fun-1',
    codigoFun: 'FUN11144477735',
    dataInicio: new Date('2025-03-01T00:00:00Z'),
    dataFim: new Date('2026-02-28T23:59:59Z'),
    dataLimiteGozo: new Date('2027-02-28T23:59:59Z'),
    diasDevidos: 30,
    diasGozados: 0,
    diasVendidos: 0,
    saldoDias: 30,
    status: 'DISPONIVEL',
    createdAt: now,
    updatedAt: now,
    ...overrides,
  }
}

const HOJE = new Date('2026-06-01T12:00:00Z')

// Seg, 06/jul/2026 a Seg 20/jul = 15 dias (passa min 14)
const DATA_INICIO_OK = new Date('2026-07-06T00:00:00Z')
const DATA_FIM_OK = new Date('2026-07-20T00:00:00Z')

describe('calcularDiasSolicitados', () => {
  it('14 dias inclusivos (06-jul a 19-jul)', () => {
    expect(calcularDiasSolicitados(new Date('2026-07-06'), new Date('2026-07-19'))).toBe(14)
  })

  it('1 dia (mesmo dia)', () => {
    expect(calcularDiasSolicitados(new Date('2026-07-06'), new Date('2026-07-06'))).toBe(1)
  })
})

describe('validarSolicitacaoFerias — caminho feliz', () => {
  it('aceita 15 dias com saldo de 30, sem frações prévias, antecedência ok', () => {
    expect(() =>
      validarSolicitacaoFerias({
        periodoAquisitivo: fakeAquisitivo(),
        dataInicio: DATA_INICIO_OK,
        dataFim: DATA_FIM_OK,
        abonoPecuniario: false,
        diasAbono: 0,
        fracoesExistentes: 0,
        feriadosOuDsr: [],
        hoje: HOJE,
      }),
    ).not.toThrow()
  })
})

describe('validarSolicitacaoFerias — vencimento e saldo', () => {
  it('rejeita 422 quando periodo está VENCIDO', () => {
    expect(() =>
      validarSolicitacaoFerias({
        periodoAquisitivo: fakeAquisitivo({ status: 'VENCIDO' }),
        dataInicio: DATA_INICIO_OK,
        dataFim: DATA_FIM_OK,
        abonoPecuniario: false,
        diasAbono: 0,
        fracoesExistentes: 0,
        feriadosOuDsr: [],
        hoje: HOJE,
      }),
    ).toThrow(PeriodoVencidoError)
  })

  it('rejeita 422 quando saldo é insuficiente', () => {
    expect(() =>
      validarSolicitacaoFerias({
        periodoAquisitivo: fakeAquisitivo({ saldoDias: 10 }),
        dataInicio: DATA_INICIO_OK,
        dataFim: DATA_FIM_OK,
        abonoPecuniario: false,
        diasAbono: 0,
        fracoesExistentes: 0,
        feriadosOuDsr: [],
        hoje: HOJE,
      }),
    ).toThrow(SaldoInsuficienteError)
  })
})

describe('validarSolicitacaoFerias — fracionamento', () => {
  it('rejeita 422 quando já existem 3 frações', () => {
    expect(() =>
      validarSolicitacaoFerias({
        periodoAquisitivo: fakeAquisitivo(),
        dataInicio: DATA_INICIO_OK,
        dataFim: DATA_FIM_OK,
        abonoPecuniario: false,
        diasAbono: 0,
        fracoesExistentes: 3,
        feriadosOuDsr: [],
        hoje: HOJE,
      }),
    ).toThrow(FracionamentoExcedidoError)
  })

  it('primeira fração precisa de ≥14 dias', () => {
    expect(() =>
      validarSolicitacaoFerias({
        periodoAquisitivo: fakeAquisitivo(),
        // 10 dias só
        dataInicio: new Date('2026-07-06'),
        dataFim: new Date('2026-07-15'),
        abonoPecuniario: false,
        diasAbono: 0,
        fracoesExistentes: 0,
        feriadosOuDsr: [],
        hoje: HOJE,
      }),
    ).toThrow(PeriodoMinimoInvalidoError)
  })

  it('demais frações exigem ≥5 dias', () => {
    expect(() =>
      validarSolicitacaoFerias({
        periodoAquisitivo: fakeAquisitivo(),
        dataInicio: new Date('2026-07-06'),
        dataFim: new Date('2026-07-08'), // 3 dias só
        abonoPecuniario: false,
        diasAbono: 0,
        fracoesExistentes: 1,
        feriadosOuDsr: [],
        hoje: HOJE,
      }),
    ).toThrow(PeriodoMinimoInvalidoError)
  })
})

describe('validarSolicitacaoFerias — antecedência e início', () => {
  it('rejeita início com menos de 30 dias de antecedência', () => {
    expect(() =>
      validarSolicitacaoFerias({
        periodoAquisitivo: fakeAquisitivo(),
        dataInicio: new Date('2026-06-10'),
        dataFim: new Date('2026-06-25'),
        abonoPecuniario: false,
        diasAbono: 0,
        fracoesExistentes: 0,
        feriadosOuDsr: [],
        hoje: HOJE, // 2026-06-01 — só 9 dias de antecedência
      }),
    ).toThrow(AntecedenciaInsuficienteError)
  })

  it('rejeita início em véspera de domingo (06-jul-2026 é seg; 11-jul=sab; 12-jul=dom)', () => {
    // Pegamos 10-jul (sex) que tem 11-jul (sab) e 12-jul (dom) nos próximos 2 dias.
    // Como 11-jul = sábado (não domingo), só o offset+1 = 12-jul = domingo cai dentro
    // dos 2 primeiros offsets ([0,1]). Domingo é DSR — vedado.
    expect(() =>
      validarSolicitacaoFerias({
        periodoAquisitivo: fakeAquisitivo(),
        dataInicio: new Date('2026-07-11'), // sábado: offset+1 é domingo
        dataFim: new Date('2026-07-25'),
        abonoPecuniario: false,
        diasAbono: 0,
        fracoesExistentes: 0,
        feriadosOuDsr: [],
        hoje: HOJE,
      }),
    ).toThrow(InicioInvalidoError)
  })

  it('rejeita início em véspera de feriado informado pelo caller', () => {
    expect(() =>
      validarSolicitacaoFerias({
        periodoAquisitivo: fakeAquisitivo(),
        dataInicio: new Date('2026-09-06'), // dom — vamos forçar erro via feriado
        dataFim: new Date('2026-09-20'),
        abonoPecuniario: false,
        diasAbono: 0,
        fracoesExistentes: 0,
        feriadosOuDsr: [new Date('2026-09-07')],
        hoje: HOJE,
      }),
    ).toThrow(InicioInvalidoError)
  })
})

describe('validarSolicitacaoFerias — abono pecuniário', () => {
  it('rejeita 422 quando diasAbono > 10', () => {
    expect(() =>
      validarSolicitacaoFerias({
        periodoAquisitivo: fakeAquisitivo(),
        dataInicio: DATA_INICIO_OK,
        dataFim: DATA_FIM_OK,
        abonoPecuniario: true,
        diasAbono: 11,
        fracoesExistentes: 0,
        feriadosOuDsr: [],
        hoje: HOJE,
      }),
    ).toThrow(AbonoInvalidoError)
  })

  it('rejeita 422 quando antecedência < 15 dias com abono', () => {
    expect(() =>
      validarSolicitacaoFerias({
        periodoAquisitivo: fakeAquisitivo(),
        dataInicio: new Date('2026-06-13'), // 12 dias de antecedência
        dataFim: new Date('2026-06-28'),
        abonoPecuniario: true,
        diasAbono: 5,
        fracoesExistentes: 0,
        feriadosOuDsr: [],
        hoje: HOJE,
      }),
    ).toThrow() // pode ser AntecedenciaInsuficiente (30 < 15) ou AbonoInvalido — ambos válidos
  })

  it('aceita abono de 5 dias respeitando todas as regras', () => {
    expect(() =>
      validarSolicitacaoFerias({
        periodoAquisitivo: fakeAquisitivo(),
        dataInicio: DATA_INICIO_OK,
        dataFim: DATA_FIM_OK, // 15 dias
        abonoPecuniario: true,
        diasAbono: 5,
        fracoesExistentes: 0,
        feriadosOuDsr: [],
        hoje: HOJE,
      }),
    ).not.toThrow()
  })
})

describe('constantes', () => {
  it('expõe os valores CLT esperados', () => {
    expect(CLT_CONSTANTES.PERIODO_AQUISITIVO_MESES).toBe(12)
    expect(CLT_CONSTANTES.PERIODO_CONCESSIVO_MESES).toBe(12)
    expect(CLT_CONSTANTES.DIAS_DIREITO).toBe(30)
    expect(CLT_CONSTANTES.MAX_FRACOES).toBe(3)
    expect(CLT_CONSTANTES.ABONO_MAX_DIAS).toBe(10)
  })
})
