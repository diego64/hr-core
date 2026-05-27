import type { ObjectId } from 'mongodb'

/**
 * Estados do período aquisitivo (CLT padrão):
 *   EM_CURSO   — dentro dos 12 meses iniciais, ainda não adquiriu direito
 *   DISPONIVEL — completou 12 meses, 30 dias disponíveis para solicitação
 *   EM_GOZO    — existe ao menos um PeriodoGozo em curso ou agendado neste aquisitivo
 *   ENCERRADO  — todos os 30 dias foram gozados/vendidos
 *   VENCIDO    — passou da data limite de gozo (período concessivo expirou)
 */
export const PERIODO_AQUISITIVO_STATUS = [
  'EM_CURSO',
  'DISPONIVEL',
  'EM_GOZO',
  'ENCERRADO',
  'VENCIDO',
] as const
export type PeriodoAquisitivoStatus = (typeof PERIODO_AQUISITIVO_STATUS)[number]

export interface PeriodoAquisitivo {
  readonly _id: ObjectId
  readonly funcionarioId: string
  readonly codigoFun: string
  readonly dataInicio: Date
  readonly dataFim: Date
  readonly dataLimiteGozo: Date
  readonly diasDevidos: number
  readonly diasGozados: number
  readonly diasVendidos: number
  readonly saldoDias: number
  readonly status: PeriodoAquisitivoStatus
  readonly createdAt: Date
  readonly updatedAt: Date
}

export interface CreatePeriodoAquisitivoInput {
  readonly funcionarioId: string
  readonly codigoFun: string
  readonly dataInicio: Date
  readonly diasDevidos?: number // default 30 — CLT padrão
}

export interface PublicPeriodoAquisitivo {
  readonly id: string
  readonly funcionarioId: string
  readonly codigoFun: string
  readonly dataInicio: string
  readonly dataFim: string
  readonly dataLimiteGozo: string
  readonly diasDevidos: number
  readonly diasGozados: number
  readonly diasVendidos: number
  readonly saldoDias: number
  readonly status: PeriodoAquisitivoStatus
  readonly createdAt: string
  readonly updatedAt: string
}

export function toPublicPeriodoAquisitivo(p: PeriodoAquisitivo): PublicPeriodoAquisitivo {
  return {
    id: p._id.toHexString(),
    funcionarioId: p.funcionarioId,
    codigoFun: p.codigoFun,
    dataInicio: p.dataInicio.toISOString(),
    dataFim: p.dataFim.toISOString(),
    dataLimiteGozo: p.dataLimiteGozo.toISOString(),
    diasDevidos: p.diasDevidos,
    diasGozados: p.diasGozados,
    diasVendidos: p.diasVendidos,
    saldoDias: p.saldoDias,
    status: p.status,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  }
}

/**
 * Adiciona N meses corridos a uma data, preservando dia (CLT considera meses
 * corridos — não 30 dias). Lida com bordas tipo 31-jan + 1 mês = 28-fev.
 */
export function addMeses(base: Date, meses: number): Date {
  const r = new Date(base.getTime())
  const dia = r.getUTCDate()
  r.setUTCMonth(r.getUTCMonth() + meses)
  // Se rolou pra mês seguinte por causa do dia inexistente, volta pro último dia do mês alvo.
  if (r.getUTCDate() !== dia) r.setUTCDate(0)
  return r
}
