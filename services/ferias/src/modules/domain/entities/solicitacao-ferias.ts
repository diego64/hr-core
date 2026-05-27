import type { ObjectId } from 'mongodb'

export const SOLICITACAO_STATUS = ['PENDENTE', 'APROVADA', 'REJEITADA', 'CANCELADA'] as const
export type SolicitacaoStatus = (typeof SOLICITACAO_STATUS)[number]

export interface SolicitacaoFerias {
  readonly _id: ObjectId
  readonly codigo: string // "FER000001"
  readonly codigoFun: string // "FUN12345678900"
  readonly funcionarioId: string
  readonly periodoAquisitivoId: ObjectId
  readonly periodoGozoId: ObjectId | null
  readonly dataInicio: Date
  readonly dataFim: Date
  readonly diasSolicitados: number
  readonly abonoPecuniario: boolean
  readonly diasAbono: number
  readonly status: SolicitacaoStatus
  readonly justificativaRejeicao: string | null
  readonly motivoCancelamento: string | null
  readonly aprovadoPor: string | null
  readonly aprovadoEm: Date | null
  readonly canceladoPor: string | null
  readonly canceladoEm: Date | null
  readonly solicitadoPor: string
  readonly createdAt: Date
  readonly updatedAt: Date
}

export interface CreateSolicitacaoFeriasInput {
  readonly codigo: string
  readonly codigoFun: string
  readonly funcionarioId: string
  readonly periodoAquisitivoId: ObjectId
  readonly dataInicio: Date
  readonly dataFim: Date
  readonly diasSolicitados: number
  readonly abonoPecuniario: boolean
  readonly diasAbono: number
  readonly solicitadoPor: string
}

export interface PublicSolicitacaoFerias {
  readonly id: string
  readonly codigo: string
  readonly codigoFun: string
  readonly funcionarioId: string
  readonly periodoAquisitivoId: string
  readonly periodoGozoId: string | null
  readonly dataInicio: string
  readonly dataFim: string
  readonly diasSolicitados: number
  readonly abonoPecuniario: boolean
  readonly diasAbono: number
  readonly status: SolicitacaoStatus
  readonly justificativaRejeicao: string | null
  readonly motivoCancelamento: string | null
  readonly aprovadoPor: string | null
  readonly aprovadoEm: string | null
  readonly canceladoPor: string | null
  readonly canceladoEm: string | null
  readonly solicitadoPor: string
  readonly createdAt: string
  readonly updatedAt: string
}

export function toPublicSolicitacaoFerias(s: SolicitacaoFerias): PublicSolicitacaoFerias {
  return {
    id: s._id.toHexString(),
    codigo: s.codigo,
    codigoFun: s.codigoFun,
    funcionarioId: s.funcionarioId,
    periodoAquisitivoId: s.periodoAquisitivoId.toHexString(),
    periodoGozoId: s.periodoGozoId ? s.periodoGozoId.toHexString() : null,
    dataInicio: s.dataInicio.toISOString(),
    dataFim: s.dataFim.toISOString(),
    diasSolicitados: s.diasSolicitados,
    abonoPecuniario: s.abonoPecuniario,
    diasAbono: s.diasAbono,
    status: s.status,
    justificativaRejeicao: s.justificativaRejeicao,
    motivoCancelamento: s.motivoCancelamento,
    aprovadoPor: s.aprovadoPor,
    aprovadoEm: s.aprovadoEm ? s.aprovadoEm.toISOString() : null,
    canceladoPor: s.canceladoPor,
    canceladoEm: s.canceladoEm ? s.canceladoEm.toISOString() : null,
    solicitadoPor: s.solicitadoPor,
    createdAt: s.createdAt.toISOString(),
    updatedAt: s.updatedAt.toISOString(),
  }
}
