import { z } from 'zod'

import {
  COMENTARIO_MAX_CHARS,
  COMENTARIO_MIN_CHARS,
  TITULO_MAX_CHARS,
  TITULO_MIN_CHARS,
} from '../domain/avaliacao-rules.js'

export const idParamSchema = z.object({
  id: z.string().min(1).max(64),
})

export const codigoParamSchema = z.object({
  codigo: z.string().regex(/^AVAL\d+$/),
})

export const codigoFunParamSchema = z.object({
  codigoFun: z.string().regex(/^FUN\d{11}$/),
})

export const setorParamSchema = z.object({
  setor: z.string().min(2).max(80),
})

export const avaliadorIdParamSchema = z.object({
  avaliadorId: z.string().min(1).max(64),
})

export const notaSchema = z.union([
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4),
  z.literal(5),
])

export const criarAvaliacaoBodySchema = z.object({
  codigoFun: z.string().regex(/^FUN\d{11}$/),
  titulo: z.string().min(TITULO_MIN_CHARS).max(TITULO_MAX_CHARS),
  comentario: z.string().min(COMENTARIO_MIN_CHARS).max(COMENTARIO_MAX_CHARS),
  nota: notaSchema,
})

export const editarAvaliacaoBodySchema = z
  .object({
    titulo: z.string().min(TITULO_MIN_CHARS).max(TITULO_MAX_CHARS).optional(),
    comentario: z.string().min(COMENTARIO_MIN_CHARS).max(COMENTARIO_MAX_CHARS).optional(),
    nota: notaSchema.optional(),
  })
  .refine((b) => Object.keys(b).length > 0, {
    message: 'Pelo menos um campo deve ser informado para edição',
  })

export const listarAvaliacoesQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
})

export const publicAvaliacaoSchema = z.object({
  id: z.string(),
  codigo: z.string(),
  codigoFun: z.string(),
  funcionarioId: z.string(),
  avaliadorId: z.string(),
  setor: z.string(),
  titulo: z.string(),
  comentario: z.string(),
  nota: notaSchema,
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
})

export const avaliacaoDataResponseSchema = z.object({ data: publicAvaliacaoSchema })

export const avaliacaoListResponseSchema = z.object({
  data: z.array(publicAvaliacaoSchema),
  meta: z.object({
    total: z.number().int().nonnegative(),
    page: z.number().int().positive(),
    limit: z.number().int().positive(),
    pages: z.number().int().positive(),
  }),
})
