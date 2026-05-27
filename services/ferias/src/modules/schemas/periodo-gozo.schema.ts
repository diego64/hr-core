import { z } from 'zod'

import { PERIODO_GOZO_STATUS } from '../domain/entities/periodo-gozo.js'

export const idParamSchema = z.object({
  id: z.string().min(1).max(64),
})

export const funcionarioIdParamSchema = z.object({
  funcionarioId: z.string().min(1).max(64),
})

export const publicPeriodoGozoSchema = z.object({
  id: z.string(),
  funcionarioId: z.string(),
  codigoFun: z.string(),
  periodoAquisitivoId: z.string(),
  solicitacaoId: z.string(),
  dataInicio: z.iso.datetime(),
  dataFim: z.iso.datetime(),
  diasGozo: z.number().int().positive(),
  diasAbono: z.number().int().nonnegative(),
  salarioBruto: z.number().nonnegative(),
  valorFerias: z.number().nonnegative(),
  valorTerco: z.number().nonnegative(),
  valorAbono: z.number().nonnegative(),
  valorTotal: z.number().nonnegative(),
  dataPagamento: z.iso.datetime().nullable(),
  status: z.enum(PERIODO_GOZO_STATUS),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
})

export const periodoGozoDataResponseSchema = z.object({ data: publicPeriodoGozoSchema })
export const periodoGozoListResponseSchema = z.object({
  data: z.array(publicPeriodoGozoSchema),
})
