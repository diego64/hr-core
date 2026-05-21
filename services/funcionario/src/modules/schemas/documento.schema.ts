import { z } from 'zod'

import { DOCUMENTO_STATUS, TIPOS_DOCUMENTO } from '../domain/entities/documento.js'

export const tipoDocumentoSchema = z.enum(TIPOS_DOCUMENTO)

export const idParamSchema = z.object({
  id: z.string().min(1).max(64),
})

export const rejeitarBodySchema = z.object({
  motivo: z.string().min(3).max(500),
})

export const publicDocumentoSchema = z.object({
  id: z.string(),
  funcionarioId: z.string(),
  tipo: tipoDocumentoSchema,
  status: z.enum(DOCUMENTO_STATUS),
  nomeOriginal: z.string(),
  mimeType: z.string(),
  tamanhoBytes: z.number().int().nonnegative(),
  downloadUrl: z.url(),
  enviadoPor: z.string(),
  enviadoEm: z.iso.datetime(),
  aprovadoPor: z.string().nullable(),
  aprovadoEm: z.iso.datetime().nullable(),
  motivoRejeicao: z.string().nullable(),
})

export const documentoDataResponseSchema = z.object({
  data: publicDocumentoSchema,
})

export const documentoListResponseSchema = z.object({
  data: z.array(publicDocumentoSchema),
})

/**
 * Resumo retornado pelo bulk-approve. NÃO devolve a lista de documentos —
 * o cliente já tinha listado antes de clicar; o que importa agora é o
 * efeito agregado (quantos aprovados e onde o funcionário ficou).
 */
export const aprovarPendentesResponseSchema = z.object({
  data: z.object({
    funcionarioId: z.string(),
    aprovados: z.number().int().nonnegative(),
    score: z.number().int().min(0).max(100),
    asoValido: z.boolean(),
    ctpsDigital: z.boolean(),
    statusFuncionario: z.string(),
  }),
})
