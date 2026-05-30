import { z } from 'zod'

export const idParamSchema = z.object({
  id: z.string().min(1).max(64),
})

export const criarAvaliadorBodySchema = z.object({
  usuarioId: z.string().min(1).max(64),
  nome: z.string().min(2).max(120),
  email: z.email(),
  setor: z.string().min(2).max(80),
})

export const listarAvaliadoresQuerySchema = z.object({
  setor: z.string().min(1).max(80).optional(),
  ativo: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === 'true')),
})

export const publicAvaliadorSchema = z.object({
  id: z.string(),
  usuarioId: z.string(),
  nome: z.string(),
  email: z.string(),
  setor: z.string(),
  ativo: z.boolean(),
  criadoPor: z.string(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
})

export const avaliadorDataResponseSchema = z.object({ data: publicAvaliadorSchema })

export const avaliadorListResponseSchema = z.object({
  data: z.array(publicAvaliadorSchema),
})
