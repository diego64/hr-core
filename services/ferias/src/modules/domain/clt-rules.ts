import {
  AbonoInvalidoError,
  AntecedenciaInsuficienteError,
  FracionamentoExcedidoError,
  InicioInvalidoError,
  PeriodoMinimoInvalidoError,
  PeriodoVencidoError,
  SaldoInsuficienteError,
} from './errors/domain-error.js'
import type { PeriodoAquisitivo } from './entities/periodo-aquisitivo.js'

/**
 * Conjunto puro de validações CLT. Sem dependência de Mongo, datas vêm
 * prontas do caller (que pode ser o service ou um teste unitário).
 *
 * Constantes:
 *   - 12 meses de período aquisitivo + 12 meses de período concessivo (CLT art. 134)
 *   - 30 dias de direito (CLT padrão, art. 130)
 *   - 14 dias mínimo no primeiro período fracionado (art. 134 §1º)
 *   - 5 dias mínimo nos demais (art. 134 §1º)
 *   - até 3 frações por período aquisitivo (art. 134 §1º)
 *   - até 10 dias em abono pecuniário (art. 143)
 *   - 15 dias de antecedência mínima para solicitar abono (art. 143 §1º)
 *   - 20 dias mínimos restantes após o abono (art. 143)
 *   - 30 dias de antecedência mínima para iniciar gozo (art. 135 — boa prática RH)
 *   - 2 dias antes de feriado/DSR vedados como início (art. 134 §3º)
 */
export const CLT_CONSTANTES = {
  PERIODO_AQUISITIVO_MESES: 12,
  PERIODO_CONCESSIVO_MESES: 12,
  DIAS_DIREITO: 30,
  DIAS_MINIMO_PRIMEIRA_FRACAO: 14,
  DIAS_MINIMO_DEMAIS_FRACOES: 5,
  MAX_FRACOES: 3,
  ABONO_MAX_DIAS: 10,
  ABONO_ANTECEDENCIA_DIAS: 15,
  SALDO_MINIMO_APOS_ABONO: 20,
  ANTECEDENCIA_MINIMA_INICIO_DIAS: 30,
  BLOQUEIO_INICIO_ANTES_FERIADO_DIAS: 2,
} as const

const MS_DIA = 24 * 60 * 60 * 1000

function diasEntre(a: Date, b: Date): number {
  return Math.floor((b.getTime() - a.getTime()) / MS_DIA)
}

export interface ValidacaoSolicitacaoInput {
  readonly periodoAquisitivo: PeriodoAquisitivo
  readonly dataInicio: Date
  readonly dataFim: Date
  readonly abonoPecuniario: boolean
  readonly diasAbono: number
  readonly fracoesExistentes: number
  readonly feriadosOuDsr: readonly Date[]
  readonly hoje: Date
}

export function calcularDiasSolicitados(dataInicio: Date, dataFim: Date): number {
  // Dias corridos inclusivos (entry e exit contam). Ex: 01/07 → 14/07 = 14 dias.
  return diasEntre(dataInicio, dataFim) + 1
}

export function validarSolicitacaoFerias(input: ValidacaoSolicitacaoInput): void {
  const {
    periodoAquisitivo,
    dataInicio,
    dataFim,
    abonoPecuniario,
    diasAbono,
    fracoesExistentes,
    feriadosOuDsr,
    hoje,
  } = input

  if (periodoAquisitivo.status === 'VENCIDO') {
    throw new PeriodoVencidoError(periodoAquisitivo.dataLimiteGozo)
  }

  const diasSolicitados = calcularDiasSolicitados(dataInicio, dataFim)
  if (diasSolicitados <= 0) {
    throw new InicioInvalidoError('dataFim precisa ser posterior a dataInicio')
  }

  const diasAbonoEfetivo = abonoPecuniario ? diasAbono : 0
  if (diasSolicitados + diasAbonoEfetivo > periodoAquisitivo.saldoDias) {
    throw new SaldoInsuficienteError(
      periodoAquisitivo.saldoDias,
      diasSolicitados + diasAbonoEfetivo,
    )
  }

  // Fracionamento
  if (fracoesExistentes >= CLT_CONSTANTES.MAX_FRACOES) {
    throw new FracionamentoExcedidoError(CLT_CONSTANTES.MAX_FRACOES)
  }

  const ehPrimeiraFracao = fracoesExistentes === 0
  const minimo = ehPrimeiraFracao
    ? CLT_CONSTANTES.DIAS_MINIMO_PRIMEIRA_FRACAO
    : CLT_CONSTANTES.DIAS_MINIMO_DEMAIS_FRACOES
  if (diasSolicitados < minimo) {
    throw new PeriodoMinimoInvalidoError(diasSolicitados, minimo, ehPrimeiraFracao)
  }

  // Antecedência
  const antecedencia = diasEntre(hoje, dataInicio)
  if (antecedencia < CLT_CONSTANTES.ANTECEDENCIA_MINIMA_INICIO_DIAS) {
    throw new AntecedenciaInsuficienteError(
      antecedencia,
      CLT_CONSTANTES.ANTECEDENCIA_MINIMA_INICIO_DIAS,
    )
  }

  // Início proibido nos 2 dias antes de feriado/domingo
  validarInicioNaoVesperaFeriado(dataInicio, feriadosOuDsr)

  // Abono pecuniário
  if (abonoPecuniario) {
    if (diasAbono < 1 || diasAbono > CLT_CONSTANTES.ABONO_MAX_DIAS) {
      throw new AbonoInvalidoError(
        `Dias de abono devem estar entre 1 e ${CLT_CONSTANTES.ABONO_MAX_DIAS}. Recebido: ${diasAbono}.`,
      )
    }
    if (antecedencia < CLT_CONSTANTES.ABONO_ANTECEDENCIA_DIAS) {
      throw new AbonoInvalidoError(
        `Solicitação de abono pecuniário requer ${CLT_CONSTANTES.ABONO_ANTECEDENCIA_DIAS} dias de antecedência. Atual: ${antecedencia}.`,
      )
    }
    const saldoRestante = periodoAquisitivo.saldoDias - diasSolicitados - diasAbono
    if (saldoRestante + diasSolicitados < CLT_CONSTANTES.SALDO_MINIMO_APOS_ABONO) {
      // Regra: precisa restar ao menos 20 dias do direito original PARA gozar
      // — ou seja, dias_gozados (este pedido + futuros) ≥ 20 dias.
      // O abono não pode comer o teto de 10 dias se isso fizer o total a
      // gozar cair abaixo de 20.
      throw new AbonoInvalidoError(
        `Após o abono restariam menos de ${CLT_CONSTANTES.SALDO_MINIMO_APOS_ABONO} dias para gozo.`,
      )
    }
  }
}

function isMesmoDia(a: Date, b: Date): boolean {
  return (
    a.getUTCFullYear() === b.getUTCFullYear() &&
    a.getUTCMonth() === b.getUTCMonth() &&
    a.getUTCDate() === b.getUTCDate()
  )
}

function ehDomingo(d: Date): boolean {
  return d.getUTCDay() === 0
}

export function validarInicioNaoVesperaFeriado(
  dataInicio: Date,
  feriadosOuDsr: readonly Date[],
): void {
  // Verifica os 2 dias seguintes ao início — se algum for feriado/domingo,
  // o início está nas "2 vésperas" e é proibido pela CLT.
  for (let offset = 0; offset < CLT_CONSTANTES.BLOQUEIO_INICIO_ANTES_FERIADO_DIAS; offset++) {
    const proximo = new Date(dataInicio.getTime() + offset * MS_DIA)
    if (ehDomingo(proximo)) {
      throw new InicioInvalidoError(
        `Início no dia ${dataInicio.toISOString().slice(0, 10)} cai nas 2 vésperas de domingo (${proximo.toISOString().slice(0, 10)}).`,
      )
    }
    if (feriadosOuDsr.some((f) => isMesmoDia(f, proximo))) {
      throw new InicioInvalidoError(
        `Início no dia ${dataInicio.toISOString().slice(0, 10)} cai nas 2 vésperas do feriado ${proximo.toISOString().slice(0, 10)}.`,
      )
    }
  }
}
