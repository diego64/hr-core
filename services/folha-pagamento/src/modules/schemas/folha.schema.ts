import { z } from 'zod'

import { STATUS_FOLHA } from '../domain/value-objects/status-folha.js'
import { TIPOS_FOLHA } from '../domain/value-objects/tipo-folha.js'
import { TIPOS_ITEM } from '../domain/entities/folha.js'

const codigoFunSchema = z
  .string()
  .regex(/^FUN\d{11,14}$/, 'Esperado formato FUN seguido do CPF (11 a 14 dígitos)')

const codigoFolhaSchema = z
  .string()
  .regex(/^FOLHA\d{6,}$/, 'Esperado formato FOLHA seguido de pelo menos 6 dígitos')

const competenciaSchema = z.string().regex(/^\d{4}(-(0[1-9]|1[0-2]))?$/, 'Esperado AAAA-MM ou AAAA')

const valorMonetarioSchema = z
  .number()
  .nonnegative('valor não pode ser negativo')
  .finite('valor inválido')

// ─── Params ────────────────────────────────────────────────────────────
export const idParamSchema = z.object({
  id: z.string().min(1),
})

export const codigoParamSchema = z.object({
  codigo: codigoFolhaSchema,
})

export const codigoFunParamSchema = z.object({
  codigoFun: codigoFunSchema,
})

export const codigoFunCompetenciaParamSchema = z.object({
  codigoFun: codigoFunSchema,
  competencia: competenciaSchema,
})

export const competenciaParamSchema = z.object({
  competencia: competenciaSchema,
})

export const verbaParamSchema = z.object({
  id: z.string().min(1),
  codigoVerba: z.string().regex(/^\d{3}$/, 'Esperado código de 3 dígitos'),
})

// ─── Query ─────────────────────────────────────────────────────────────
export const listarFolhasQuerySchema = z.object({
  status: z.enum(STATUS_FOLHA).optional(),
  tipo: z.enum(TIPOS_FOLHA).optional(),
  funcionarioId: z.string().optional(),
  codigoFun: codigoFunSchema.optional(),
  competencia: competenciaSchema.optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
})

// ─── Body ──────────────────────────────────────────────────────────────
export const abrirFolhaBodySchema = z.object({
  codigoFun: codigoFunSchema,
  tipo: z.enum(TIPOS_FOLHA),
  competencia: competenciaSchema,
})

export const lancarVerbaBodySchema = z.object({
  codigo: z.string().regex(/^\d{3}$/, 'Esperado código de 3 dígitos'),
  valor: valorMonetarioSchema,
  descricao: z.string().min(1).max(120).nullish(),
  referencia: z.string().min(1).max(60).nullish(),
})

export const rejeitarFolhaBodySchema = z.object({
  justificativa: z.string().min(3, 'mínimo 3 caracteres').max(500),
})

// ─── Response ──────────────────────────────────────────────────────────
const itemFolhaSchema = z.object({
  codigo: z.string(),
  descricao: z.string(),
  tipo: z.enum(TIPOS_ITEM),
  valor: z.number(),
  referencia: z.string().nullable(),
})

export const publicFolhaSchema = z.object({
  id: z.string(),
  codigo: z.string(),
  codigoFun: z.string(),
  funcionarioId: z.string(),
  tipo: z.enum(TIPOS_FOLHA),
  competencia: z.string(),
  salarioBase: z.number(),
  numeroDependentes: z.number().int().nonnegative(),
  proventos: z.array(itemFolhaSchema),
  descontos: z.array(itemFolhaSchema),
  totalProventos: z.number(),
  totalDescontos: z.number(),
  salarioLiquido: z.number(),
  fgts: z.number(),
  descontoINSS: z.number(),
  descontoIRRF: z.number(),
  status: z.enum(STATUS_FOLHA),
  processadaPor: z.string().nullable(),
  processadaEm: z.iso.datetime().nullable(),
  aprovadaPor: z.string().nullable(),
  aprovadaEm: z.iso.datetime().nullable(),
  justificativaRejeicao: z.string().nullable(),
  pagaPor: z.string().nullable(),
  pagaEm: z.iso.datetime().nullable(),
  fechadaPor: z.string().nullable(),
  fechadaEm: z.iso.datetime().nullable(),
  periodoGozoId: z.string().nullable(),
  abertaPor: z.string(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
})

export const folhaDataResponseSchema = z.object({ data: publicFolhaSchema })

export const folhaListResponseSchema = z.object({
  data: z.array(publicFolhaSchema),
  meta: z.object({
    total: z.number().int().nonnegative(),
    page: z.number().int().positive(),
    limit: z.number().int().positive(),
    pages: z.number().int().positive(),
  }),
})
