import { z } from 'zod'

import { SOLICITACAO_STATUS } from '../domain/entities/solicitacao-ferias.js'

export const idParamSchema = z.object({
  id: z.string().min(1).max(64),
})

export const funcionarioIdParamSchema = z.object({
  funcionarioId: z.string().min(1).max(64),
})

export const criarSolicitacaoBodySchema = z
  .object({
    dataInicio: z.iso.datetime(),
    dataFim: z.iso.datetime(),
    abonoPecuniario: z.boolean().default(false),
    diasAbono: z.number().int().min(0).max(10).default(0),
  })
  .refine((d) => new Date(d.dataFim) > new Date(d.dataInicio), {
    message: 'dataFim precisa ser posterior a dataInicio',
    path: ['dataFim'],
  })

export const aprovarSolicitacaoBodySchema = z.object({
  // Snapshot do salário no momento da aprovação. Em produção virá do
  // ms-funcionario via consumer SalarioAtual; por ora o COORD passa.
  salarioBruto: z.number().positive(),
})

export const rejeitarSolicitacaoBodySchema = z.object({
  justificativa: z.string().min(3).max(500),
})

export const cancelarSolicitacaoBodySchema = z.object({
  motivo: z.string().min(3).max(500),
})

export const listarSolicitacoesQuerySchema = z.object({
  status: z.enum(SOLICITACAO_STATUS).optional(),
  funcionarioId: z.string().min(1).max(64).optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
})

export const publicSolicitacaoSchema = z.object({
  id: z.string(),
  codigo: z.string(),
  codigoFun: z.string(),
  funcionarioId: z.string(),
  periodoAquisitivoId: z.string(),
  periodoGozoId: z.string().nullable(),
  dataInicio: z.iso.datetime(),
  dataFim: z.iso.datetime(),
  diasSolicitados: z.number().int().positive(),
  abonoPecuniario: z.boolean(),
  diasAbono: z.number().int().nonnegative(),
  status: z.enum(SOLICITACAO_STATUS),
  justificativaRejeicao: z.string().nullable(),
  motivoCancelamento: z.string().nullable(),
  aprovadoPor: z.string().nullable(),
  aprovadoEm: z.iso.datetime().nullable(),
  canceladoPor: z.string().nullable(),
  canceladoEm: z.iso.datetime().nullable(),
  solicitadoPor: z.string(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
})

export const solicitacaoDataResponseSchema = z.object({ data: publicSolicitacaoSchema })

export const solicitacaoListResponseSchema = z.object({
  data: z.array(publicSolicitacaoSchema),
  meta: z.object({
    total: z.number().int().nonnegative(),
    page: z.number().int().positive(),
    limit: z.number().int().positive(),
    pages: z.number().int().positive(),
  }),
})
