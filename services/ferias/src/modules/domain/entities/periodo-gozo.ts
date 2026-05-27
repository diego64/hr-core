import type { ObjectId } from 'mongodb'

export const PERIODO_GOZO_STATUS = ['AGENDADO', 'EM_GOZO', 'CONCLUIDO', 'CANCELADO'] as const
export type PeriodoGozoStatus = (typeof PERIODO_GOZO_STATUS)[number]

export interface PeriodoGozo {
  readonly _id: ObjectId
  readonly funcionarioId: string
  readonly codigoFun: string
  readonly periodoAquisitivoId: ObjectId
  readonly solicitacaoId: ObjectId
  readonly dataInicio: Date
  readonly dataFim: Date
  readonly diasGozo: number
  readonly diasAbono: number
  readonly salarioBruto: number // snapshot do salário no momento da aprovação
  readonly valorFerias: number
  readonly valorTerco: number
  readonly valorAbono: number
  readonly valorTotal: number
  readonly dataPagamento: Date | null
  readonly status: PeriodoGozoStatus
  readonly createdAt: Date
  readonly updatedAt: Date
}

export interface CreatePeriodoGozoInput {
  readonly funcionarioId: string
  readonly codigoFun: string
  readonly periodoAquisitivoId: ObjectId
  readonly solicitacaoId: ObjectId
  readonly dataInicio: Date
  readonly dataFim: Date
  readonly diasGozo: number
  readonly diasAbono: number
  readonly salarioBruto: number
  readonly valorFerias: number
  readonly valorTerco: number
  readonly valorAbono: number
  readonly valorTotal: number
}

export interface PublicPeriodoGozo {
  readonly id: string
  readonly funcionarioId: string
  readonly codigoFun: string
  readonly periodoAquisitivoId: string
  readonly solicitacaoId: string
  readonly dataInicio: string
  readonly dataFim: string
  readonly diasGozo: number
  readonly diasAbono: number
  readonly salarioBruto: number
  readonly valorFerias: number
  readonly valorTerco: number
  readonly valorAbono: number
  readonly valorTotal: number
  readonly dataPagamento: string | null
  readonly status: PeriodoGozoStatus
  readonly createdAt: string
  readonly updatedAt: string
}

export function toPublicPeriodoGozo(p: PeriodoGozo): PublicPeriodoGozo {
  return {
    id: p._id.toHexString(),
    funcionarioId: p.funcionarioId,
    codigoFun: p.codigoFun,
    periodoAquisitivoId: p.periodoAquisitivoId.toHexString(),
    solicitacaoId: p.solicitacaoId.toHexString(),
    dataInicio: p.dataInicio.toISOString(),
    dataFim: p.dataFim.toISOString(),
    diasGozo: p.diasGozo,
    diasAbono: p.diasAbono,
    salarioBruto: p.salarioBruto,
    valorFerias: p.valorFerias,
    valorTerco: p.valorTerco,
    valorAbono: p.valorAbono,
    valorTotal: p.valorTotal,
    dataPagamento: p.dataPagamento ? p.dataPagamento.toISOString() : null,
    status: p.status,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  }
}
