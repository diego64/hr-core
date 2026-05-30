import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'

import type { PeriodoGozoService } from '../services/periodo-gozo.service.js'
import {
  funcionarioIdParamSchema,
  idParamSchema,
  periodoGozoDataResponseSchema,
  periodoGozoListResponseSchema,
} from '../schemas/periodo-gozo.schema.js'

export function buildPeriodoGozoRoutes(service: PeriodoGozoService): FastifyPluginAsyncZod {
  return async (fastify) => {
    // GET /funcionarios/:funcionarioId/periodos-gozo
    fastify.get(
      '/funcionarios/:funcionarioId/periodos-gozo',
      {
        preHandler: [
          fastify.authenticate,
          fastify.requireRole(['USUARIO', 'COORDENADOR', 'ADMINISTRADOR']),
        ],
        schema: {
          tags: ['Períodos de Gozo'],
          summary: 'Lista períodos de gozo do funcionário',
          params: funcionarioIdParamSchema,
          response: { 200: periodoGozoListResponseSchema },
        },
      },
      async (request) => {
        const data = await service.listarPorFuncionario(request.params.funcionarioId)
        return { data }
      },
    )

    // GET /periodos-gozo/:id
    fastify.get(
      '/periodos-gozo/:id',
      {
        preHandler: [
          fastify.authenticate,
          fastify.requireRole(['USUARIO', 'COORDENADOR', 'ADMINISTRADOR']),
        ],
        schema: {
          tags: ['Períodos de Gozo'],
          summary: 'Busca período de gozo por ID',
          params: idParamSchema,
          response: { 200: periodoGozoDataResponseSchema },
        },
      },
      async (request) => {
        const data = await service.buscarPorId(request.params.id)
        return { data }
      },
    )
  }
}
