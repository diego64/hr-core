import { z } from 'zod'

import { PERIODO_AQUISITIVO_STATUS } from '../domain/entities/periodo-aquisitivo.js'

export const funcionarioIdParamSchema = z.object({
  funcionarioId: z.string().min(1).max(64),
})

export const publicPeriodoAquisitivoSchema = z.object({
  id: z.string(),
  funcionarioId: z.string(),
  codigoFun: z.string(),
  dataInicio: z.iso.datetime(),
  dataFim: z.iso.datetime(),
  dataLimiteGozo: z.iso.datetime(),
  diasDevidos: z.number().int().nonnegative(),
  diasGozados: z.number().int().nonnegative(),
  diasVendidos: z.number().int().nonnegative(),
  saldoDias: z.number().int(),
  status: z.enum(PERIODO_AQUISITIVO_STATUS),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
})

export const periodoAquisitivoDataResponseSchema = z.object({
  data: publicPeriodoAquisitivoSchema,
})

export const periodoAquisitivoListResponseSchema = z.object({
  data: z.array(publicPeriodoAquisitivoSchema),
})

// Endpoint admin temporário (até Kafka subir) que inicia um aquisitivo dado
// funcionarioId + cpf + data de admissão.
export const iniciarPeriodoBodySchema = z.object({
  funcionarioId: z.string().min(1).max(64),
  cpf: z.string().min(11).max(14),
  dataInicio: z.iso.datetime(),
})
