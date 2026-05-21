import type { ObjectId } from 'mongodb'

export const TIPOS_APROVACAO = ['ALTERACAO_CADASTRAL'] as const
export type TipoAprovacao = (typeof TIPOS_APROVACAO)[number]

export const APROVACAO_STATUS = ['PENDENTE', 'APROVADA', 'REJEITADA'] as const
export type AprovacaoStatus = (typeof APROVACAO_STATUS)[number]

/**
 * Campos do funcionário que podem ser alterados via fluxo de aprovação.
 * NÃO inclui:
 *   - cpf, email (chaves únicas — mudança exigiria fluxo separado de
 *     deduplicação/migração)
 *   - codigoFun, codigoHR (gerados pelo sistema, imutáveis)
 *   - status, score, asoValido, ctpsDigital (administrados pelo workflow
 *     de admissão e por eventos de domínio)
 *   - nome (alteração de nome civil exige documentação formal — fora do
 *     escopo deste fluxo)
 *
 * Propriedades aceitam `undefined` explicitamente para casar com o shape
 * que sai do `safeParse` do Zod com `exactOptionalPropertyTypes: true`.
 * O service filtra essas chaves antes de persistir.
 */
export interface CamposEditaveis {
  readonly telefone?: string | undefined
  readonly cargo?: string | undefined
  readonly departamento?: string | undefined
  readonly gestorId?: string | null | undefined
}

export interface Aprovacao {
  readonly _id: ObjectId
  readonly funcionarioId: ObjectId
  readonly tipo: TipoAprovacao
  readonly status: AprovacaoStatus
  readonly camposAlterados: CamposEditaveis
  readonly solicitadoPor: string
  readonly solicitadoEm: Date
  readonly aprovadoPor: string | null
  readonly aprovadoEm: Date | null
  readonly motivoRejeicao: string | null
  readonly updatedAt: Date
}

export interface CreateAprovacaoInput {
  readonly funcionarioId: ObjectId
  readonly tipo: TipoAprovacao
  readonly camposAlterados: CamposEditaveis
  readonly solicitadoPor: string
}

export interface PublicAprovacao {
  readonly id: string
  readonly funcionarioId: string
  readonly tipo: TipoAprovacao
  readonly status: AprovacaoStatus
  readonly camposAlterados: CamposEditaveis
  readonly solicitadoPor: string
  readonly solicitadoEm: string
  readonly aprovadoPor: string | null
  readonly aprovadoEm: string | null
  readonly motivoRejeicao: string | null
}

export function toPublicAprovacao(a: Aprovacao): PublicAprovacao {
  return {
    id: a._id.toHexString(),
    funcionarioId: a.funcionarioId.toHexString(),
    tipo: a.tipo,
    status: a.status,
    camposAlterados: a.camposAlterados,
    solicitadoPor: a.solicitadoPor,
    solicitadoEm: a.solicitadoEm.toISOString(),
    aprovadoPor: a.aprovadoPor,
    aprovadoEm: a.aprovadoEm ? a.aprovadoEm.toISOString() : null,
    motivoRejeicao: a.motivoRejeicao,
  }
}
