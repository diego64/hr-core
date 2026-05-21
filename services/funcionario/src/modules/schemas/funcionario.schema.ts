import { z } from 'zod'

import { FUNCIONARIO_STATUS } from '../domain/entities/funcionario.js'

export const criarFuncionarioBodySchema = z.object({
  nome: z.string().min(2).max(120),
  cpf: z.string().min(11).max(14),
  email: z.email().max(254),
  telefone: z.string().min(8).max(20),
  cargo: z.string().min(1).max(120),
  departamento: z.string().min(1).max(120),
  gestorId: z.string().min(1).max(64).optional(),
})

export const listarFuncionariosQuerySchema = z.object({
  status: z.enum(FUNCIONARIO_STATUS).optional(),
  departamento: z.string().min(1).max(120).optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
})

export const idParamSchema = z.object({
  id: z.string().min(1).max(64),
})

export const publicFuncionarioSchema = z.object({
  id: z.string(),
  codigoFun: z.string(),
  codigoHR: z.string(),
  nome: z.string(),
  cpf: z.string(),
  email: z.email(),
  telefone: z.string(),
  cargo: z.string(),
  departamento: z.string(),
  gestorId: z.string().nullable(),
  status: z.enum(FUNCIONARIO_STATUS),
  score: z.number().int().min(0).max(100),
  asoValido: z.boolean(),
  ctpsDigital: z.boolean(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
})

export const dataResponseSchema = z.object({
  data: publicFuncionarioSchema,
})

export const dataListResponseSchema = z.object({
  data: z.array(publicFuncionarioSchema),
  meta: z.object({
    total: z.number().int().nonnegative(),
    page: z.number().int().positive(),
    limit: z.number().int().positive(),
    pages: z.number().int().positive(),
  }),
})

export const healthResponseSchema = z.object({
  status: z.literal('ok'),
  service: z.literal('funcionario'),
  timestamp: z.iso.datetime(),
})
