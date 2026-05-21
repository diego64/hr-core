import type { ObjectId } from 'mongodb'

/**
 * Tipos de documento exigidos no processo admissional eSocial.
 * A combinação completa (todos os 6 com status APROVADO) leva o score a 100.
 * Pesos individuais ficam em `domain/score.ts` (Fase 4).
 */
export const TIPOS_DOCUMENTO = [
  'RG',
  'CPF',
  'CTPS_DIGITAL',
  'ASO_ADMISSIONAL',
  'PIS',
  'COMPROVANTE_ENDERECO',
] as const
export type TipoDocumento = (typeof TIPOS_DOCUMENTO)[number]

/**
 * Estados de um documento individual:
 *   PENDENTE  → recém-enviado, aguardando análise do COORDENADOR
 *   APROVADO  → COORDENADOR validou; conta para o score
 *   REJEITADO → COORDENADOR rejeitou; não conta para o score, USUARIO reenvia
 */
export const DOCUMENTO_STATUS = ['PENDENTE', 'APROVADO', 'REJEITADO'] as const
export type DocumentoStatus = (typeof DOCUMENTO_STATUS)[number]

export interface Documento {
  readonly _id: ObjectId
  readonly funcionarioId: ObjectId
  readonly tipo: TipoDocumento
  readonly status: DocumentoStatus
  readonly storageKey: string
  readonly nomeOriginal: string
  readonly mimeType: string
  readonly tamanhoBytes: number
  readonly enviadoPor: string
  readonly enviadoEm: Date
  readonly aprovadoPor: string | null
  readonly aprovadoEm: Date | null
  readonly motivoRejeicao: string | null
  readonly updatedAt: Date
}

export interface CreateDocumentoInput {
  readonly funcionarioId: ObjectId
  readonly tipo: TipoDocumento
  readonly storageKey: string
  readonly nomeOriginal: string
  readonly mimeType: string
  readonly tamanhoBytes: number
  readonly enviadoPor: string
}

export interface PublicDocumento {
  readonly id: string
  readonly funcionarioId: string
  readonly tipo: TipoDocumento
  readonly status: DocumentoStatus
  readonly nomeOriginal: string
  readonly mimeType: string
  readonly tamanhoBytes: number
  readonly downloadUrl: string
  readonly enviadoPor: string
  readonly enviadoEm: string
  readonly aprovadoPor: string | null
  readonly aprovadoEm: string | null
  readonly motivoRejeicao: string | null
}

export function toPublicDocumento(d: Documento, downloadUrl: string): PublicDocumento {
  return {
    id: d._id.toHexString(),
    funcionarioId: d.funcionarioId.toHexString(),
    tipo: d.tipo,
    status: d.status,
    nomeOriginal: d.nomeOriginal,
    mimeType: d.mimeType,
    tamanhoBytes: d.tamanhoBytes,
    downloadUrl,
    enviadoPor: d.enviadoPor,
    enviadoEm: d.enviadoEm.toISOString(),
    aprovadoPor: d.aprovadoPor,
    aprovadoEm: d.aprovadoEm ? d.aprovadoEm.toISOString() : null,
    motivoRejeicao: d.motivoRejeicao,
  }
}
