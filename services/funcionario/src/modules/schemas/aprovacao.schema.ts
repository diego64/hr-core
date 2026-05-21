import { z } from 'zod'

import { APROVACAO_STATUS, TIPOS_APROVACAO } from '../domain/entities/aprovacao.js'

/**
 * Body do PATCH /funcionarios/:id. Todos os campos opcionais — pelo menos 1
 * obrigatório (validado no service para devolver `sem-campos-para-alterar`
 * com 422 ao invés de 400 do Zod).
 */
export const patchFuncionarioBodySchema = z.object({
  telefone: z.string().min(8).max(20).optional(),
  cargo: z.string().min(1).max(120).optional(),
  departamento: z.string().min(1).max(120).optional(),
  gestorId: z.string().min(1).max(64).nullable().optional(),
})

export const camposEditaveisSchema = patchFuncionarioBodySchema // mesmo shape

export const listarAprovacoesQuerySchema = z.object({
  status: z.enum(APROVACAO_STATUS).optional(),
  funcionarioId: z.string().min(1).max(64).optional(),
})

export const idParamSchema = z.object({
  id: z.string().min(1).max(64),
})

export const rejeitarAprovacaoBodySchema = z.object({
  motivo: z.string().min(3).max(500),
})

export const publicAprovacaoSchema = z.object({
  id: z.string(),
  funcionarioId: z.string(),
  tipo: z.enum(TIPOS_APROVACAO),
  status: z.enum(APROVACAO_STATUS),
  camposAlterados: camposEditaveisSchema,
  solicitadoPor: z.string(),
  solicitadoEm: z.iso.datetime(),
  aprovadoPor: z.string().nullable(),
  aprovadoEm: z.iso.datetime().nullable(),
  motivoRejeicao: z.string().nullable(),
})

export const aprovacaoDataResponseSchema = z.object({ data: publicAprovacaoSchema })
export const aprovacaoListResponseSchema = z.object({ data: z.array(publicAprovacaoSchema) })
