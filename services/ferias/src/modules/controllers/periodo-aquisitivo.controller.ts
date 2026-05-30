import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'

import type { PeriodoAquisitivoService } from '../services/periodo-aquisitivo.service.js'
import {
  funcionarioIdParamSchema,
  iniciarPeriodoBodySchema,
  periodoAquisitivoDataResponseSchema,
  periodoAquisitivoListResponseSchema,
} from '../schemas/periodo-aquisitivo.schema.js'

export function buildPeriodoAquisitivoRoutes(
  service: PeriodoAquisitivoService,
): FastifyPluginAsyncZod {
  return async (fastify) => {
    // GET /funcionarios/:funcionarioId/periodo-aquisitivo (vigente)
    fastify.get(
      '/funcionarios/:funcionarioId/periodo-aquisitivo',
      {
        preHandler: [
          fastify.authenticate,
          fastify.requireRole(['USUARIO', 'COORDENADOR', 'ADMINISTRADOR']),
        ],
        schema: {
          tags: ['Período Aquisitivo'],
          summary: 'Retorna o período aquisitivo vigente do funcionário',
          params: funcionarioIdParamSchema,
          response: { 200: periodoAquisitivoDataResponseSchema },
        },
      },
      async (request) => {
        const data = await service.buscarVigente(request.params.funcionarioId)
        return { data }
      },
    )

    // GET /funcionarios/:funcionarioId/periodos-aquisitivos (histórico)
    fastify.get(
      '/funcionarios/:funcionarioId/periodos-aquisitivos',
      {
        preHandler: [
          fastify.authenticate,
          fastify.requireRole(['USUARIO', 'COORDENADOR', 'ADMINISTRADOR']),
        ],
        schema: {
          tags: ['Período Aquisitivo'],
          summary: 'Lista o histórico de períodos aquisitivos do funcionário',
          params: funcionarioIdParamSchema,
          response: { 200: periodoAquisitivoListResponseSchema },
        },
      },
      async (request) => {
        const data = await service.listarHistorico(request.params.funcionarioId)
        return { data }
      },
    )

    // POST /admin/iniciar-periodo (ADMINISTRADOR)
    // Placeholder enquanto Kafka não está integrado. Quando o consumer de
    // FuncionarioCriado entrar no projeto, esse endpoint pode ser removido
    // ou restrito ainda mais (uso emergencial).
    fastify.post(
      '/admin/iniciar-periodo',
      {
        preHandler: [fastify.authenticate, fastify.requireRole('ADMINISTRADOR')],
        schema: {
          tags: ['Período Aquisitivo', 'Admin'],
          summary: 'Inicia manualmente um período aquisitivo (até Kafka FuncionarioCriado entrar)',
          description:
            'Endpoint temporário. Quando o ms-funcionario publicar FuncionarioCriado, o ' +
            'consumer Kafka chamará esta lógica automaticamente.',
          body: iniciarPeriodoBodySchema,
          response: { 201: periodoAquisitivoDataResponseSchema },
        },
      },
      async (request, reply) => {
        const data = await service.iniciar({
          funcionarioId: request.body.funcionarioId,
          cpf: request.body.cpf,
          dataInicio: new Date(request.body.dataInicio),
        })
        return reply.status(201).send({ data })
      },
    )
  }
}
