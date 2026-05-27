import type { ObjectId } from 'mongodb'

export const AUDITORIA_ACOES = [
  'FERIAS_SOLICITADAS',
  'FERIAS_APROVADAS',
  'FERIAS_REJEITADAS',
  'FERIAS_CANCELADAS',
  'GOZO_INICIADO',
  'GOZO_CONCLUIDO',
  'PERIODO_INICIADO',
  'PERIODO_VENCIDO',
] as const
export type AuditoriaAcao = (typeof AUDITORIA_ACOES)[number]

export interface Auditoria {
  readonly _id: ObjectId
  readonly usuarioId: string | null
  readonly acao: AuditoriaAcao
  readonly recurso: string
  readonly recursoId: string
  readonly valorAnterior: Record<string, unknown> | null
  readonly valorNovo: Record<string, unknown> | null
  readonly ip: string | null
  readonly userAgent: string | null
  readonly createdAt: Date
}

export interface CreateAuditoriaInput {
  readonly usuarioId: string | null
  readonly acao: AuditoriaAcao
  readonly recurso: string
  readonly recursoId: string
  readonly valorAnterior?: Record<string, unknown> | null
  readonly valorNovo?: Record<string, unknown> | null
  readonly ip?: string | null
  readonly userAgent?: string | null
}
