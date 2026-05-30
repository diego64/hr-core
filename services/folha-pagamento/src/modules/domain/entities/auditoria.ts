import type { ObjectId } from 'mongodb'

export const AUDITORIA_ACOES = [
  'FOLHA_ABERTA',
  'FOLHA_VERBA_LANCADA',
  'FOLHA_VERBA_REMOVIDA',
  'FOLHA_PROCESSADA',
  'FOLHA_APROVADA',
  'FOLHA_REJEITADA',
  'FOLHA_PAGA',
  'FOLHA_FECHADA',
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
