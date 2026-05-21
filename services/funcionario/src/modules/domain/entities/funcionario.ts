import type { ObjectId } from 'mongodb'

/**
 * Estados do ciclo de vida do funcionário.
 *
 * Workflow de admissão (rules 1-8):
 *   PENDENTE       → recém-cadastrado, antes de qualquer documento
 *   EM_VALIDACAO   → tem pelo menos 1 documento enviado, mas não satisfaz eSocial
 *   APROVADO       → score=100 + asoValido + ctpsDigital, aguarda promoção a ATIVO
 *   ATIVO          → funcionário operacional
 *   REPROVADO      → COORDENADOR rejeitou definitivamente (terminal)
 *
 * Pós-admissão:
 *   AFASTADO       → afastamento temporário (volta para ATIVO)
 *   INATIVO        → desativado sem desligamento formal (admin)
 *   DESLIGADO      → soft delete, terminal
 */
export const FUNCIONARIO_STATUS = [
  'PENDENTE',
  'EM_VALIDACAO',
  'APROVADO',
  'ATIVO',
  'REPROVADO',
  'AFASTADO',
  'INATIVO',
  'DESLIGADO',
] as const
export type FuncionarioStatus = (typeof FUNCIONARIO_STATUS)[number]

export interface Funcionario {
  readonly _id: ObjectId
  readonly codigoFun: string
  readonly codigoHR: string
  readonly nome: string
  readonly cpf: string
  readonly email: string
  readonly telefone: string
  readonly cargo: string
  readonly departamento: string
  readonly gestorId: string | null
  readonly status: FuncionarioStatus
  // Snapshot da validação eSocial — recalculado a cada aprovação de documento.
  readonly score: number
  readonly asoValido: boolean
  readonly ctpsDigital: boolean
  readonly createdAt: Date
  readonly updatedAt: Date
}

export interface CreateFuncionarioInput {
  readonly codigoFun: string
  readonly codigoHR: string
  readonly nome: string
  readonly cpf: string
  readonly email: string
  readonly telefone: string
  readonly cargo: string
  readonly departamento: string
  readonly gestorId?: string | null
  readonly status?: FuncionarioStatus
  readonly score?: number
  readonly asoValido?: boolean
  readonly ctpsDigital?: boolean
}

export interface PublicFuncionario {
  readonly id: string
  readonly codigoFun: string
  readonly codigoHR: string
  readonly nome: string
  readonly cpf: string
  readonly email: string
  readonly telefone: string
  readonly cargo: string
  readonly departamento: string
  readonly gestorId: string | null
  readonly status: FuncionarioStatus
  readonly score: number
  readonly asoValido: boolean
  readonly ctpsDigital: boolean
  readonly createdAt: string
  readonly updatedAt: string
}

export function toPublicFuncionario(f: Funcionario): PublicFuncionario {
  return {
    id: f._id.toHexString(),
    codigoFun: f.codigoFun,
    codigoHR: f.codigoHR,
    nome: f.nome,
    cpf: f.cpf,
    email: f.email,
    telefone: f.telefone,
    cargo: f.cargo,
    departamento: f.departamento,
    gestorId: f.gestorId,
    status: f.status,
    score: f.score,
    asoValido: f.asoValido,
    ctpsDigital: f.ctpsDigital,
    createdAt: f.createdAt.toISOString(),
    updatedAt: f.updatedAt.toISOString(),
  }
}
