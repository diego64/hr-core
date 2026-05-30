import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'

import type { SolicitacaoFeriasService } from '../services/solicitacao-ferias.service.js'
import {
  aprovarSolicitacaoBodySchema,
  cancelarSolicitacaoBodySchema,
  criarSolicitacaoBodySchema,
  funcionarioIdParamSchema,
  idParamSchema,
  listarSolicitacoesQuerySchema,
  rejeitarSolicitacaoBodySchema,
  solicitacaoDataResponseSchema,
  solicitacaoListResponseSchema,
} from '../schemas/solicitacao-ferias.schema.js'

export function buildSolicitacaoFeriasRoutes(
  service: SolicitacaoFeriasService,
): FastifyPluginAsyncZod {
  return async (fastify) => {
    // GET /solicitacoes (COORD/ADMIN)
    fastify.get(
      '/solicitacoes',
      {
        preHandler: [fastify.authenticate, fastify.requireRole(['COORDENADOR', 'ADMINISTRADOR'])],
        schema: {
          tags: ['Solicitações'],
          summary: 'Lista solicitações de férias (filtros: status, funcionarioId)',
          querystring: listarSolicitacoesQuerySchema,
          response: { 200: solicitacaoListResponseSchema },
        },
      },
      async (request) => {
        const { status, funcionarioId, page, limit } = request.query
        const result = await service.listar(
          {
            ...(status !== undefined ? { status } : {}),
            ...(funcionarioId !== undefined ? { funcionarioId } : {}),
          },
          page,
          limit,
        )
        return {
          data: result.items,
          meta: {
            total: result.total,
            page: result.page,
            limit: result.limit,
            pages: result.pages,
          },
        }
      },
    )

    // GET /funcionarios/:funcionarioId/solicitacoes
    fastify.get(
      '/funcionarios/:funcionarioId/solicitacoes',
      {
        preHandler: [
          fastify.authenticate,
          fastify.requireRole(['USUARIO', 'COORDENADOR', 'ADMINISTRADOR']),
        ],
        schema: {
          tags: ['Solicitações'],
          summary: 'Lista solicitações de um funcionário',
          params: funcionarioIdParamSchema,
          querystring: listarSolicitacoesQuerySchema,
          response: { 200: solicitacaoListResponseSchema },
        },
      },
      async (request) => {
        const { status, page, limit } = request.query
        const result = await service.listar(
          {
            funcionarioId: request.params.funcionarioId,
            ...(status !== undefined ? { status } : {}),
          },
          page,
          limit,
        )
        return {
          data: result.items,
          meta: {
            total: result.total,
            page: result.page,
            limit: result.limit,
            pages: result.pages,
          },
        }
      },
    )

    // GET /solicitacoes/:id
    fastify.get(
      '/solicitacoes/:id',
      {
        preHandler: [
          fastify.authenticate,
          fastify.requireRole(['USUARIO', 'COORDENADOR', 'ADMINISTRADOR']),
        ],
        schema: {
          tags: ['Solicitações'],
          summary: 'Busca solicitação por ID',
          params: idParamSchema,
          response: { 200: solicitacaoDataResponseSchema },
        },
      },
      async (request) => {
        const data = await service.buscarPorId(request.params.id)
        return { data }
      },
    )

    // POST /funcionarios/:funcionarioId/solicitacoes (USUARIO)
    fastify.post(
      '/funcionarios/:funcionarioId/solicitacoes',
      {
        preHandler: [fastify.authenticate, fastify.requireRole('USUARIO')],
        schema: {
          tags: ['Solicitações'],
          summary: 'Cria solicitação de férias (USUARIO) — aplica todas validações CLT',
          params: funcionarioIdParamSchema,
          body: criarSolicitacaoBodySchema,
          response: { 201: solicitacaoDataResponseSchema },
        },
      },
      async (request, reply) => {
        const sub = request.user?.sub ?? 'desconhecido'
        const data = await service.criar({
          funcionarioId: request.params.funcionarioId,
          dataInicio: new Date(request.body.dataInicio),
          dataFim: new Date(request.body.dataFim),
          abonoPecuniario: request.body.abonoPecuniario,
          diasAbono: request.body.diasAbono,
          solicitadoPor: sub,
        })
        return reply.status(201).send({ data })
      },
    )

    // POST /solicitacoes/:id/aprovar (COORD/ADMIN)
    fastify.post(
      '/solicitacoes/:id/aprovar',
      {
        preHandler: [fastify.authenticate, fastify.requireRole(['COORDENADOR', 'ADMINISTRADOR'])],
        schema: {
          tags: ['Solicitações'],
          summary: 'Aprova solicitação — cria PeriodoGozo e debita saldo',
          params: idParamSchema,
          body: aprovarSolicitacaoBodySchema,
          response: { 200: solicitacaoDataResponseSchema },
        },
      },
      async (request) => {
        const sub = request.user?.sub ?? 'desconhecido'
        const data = await service.aprovar({
          id: request.params.id,
          aprovadoPor: sub,
          salarioBruto: request.body.salarioBruto,
          ip: request.ip ?? null,
          userAgent: request.headers['user-agent'] ?? null,
        })
        return { data }
      },
    )

    // POST /solicitacoes/:id/rejeitar (COORD/ADMIN)
    fastify.post(
      '/solicitacoes/:id/rejeitar',
      {
        preHandler: [fastify.authenticate, fastify.requireRole(['COORDENADOR', 'ADMINISTRADOR'])],
        schema: {
          tags: ['Solicitações'],
          summary: 'Rejeita solicitação com justificativa obrigatória',
          params: idParamSchema,
          body: rejeitarSolicitacaoBodySchema,
          response: { 200: solicitacaoDataResponseSchema },
        },
      },
      async (request) => {
        const sub = request.user?.sub ?? 'desconhecido'
        const data = await service.rejeitar({
          id: request.params.id,
          aprovadoPor: sub,
          justificativa: request.body.justificativa,
          ip: request.ip ?? null,
          userAgent: request.headers['user-agent'] ?? null,
        })
        return { data }
      },
    )

    // POST /solicitacoes/:id/cancelar (USUARIO próprio/PENDENTE | ADMIN qualquer)
    fastify.post(
      '/solicitacoes/:id/cancelar',
      {
        preHandler: [fastify.authenticate, fastify.requireRole(['USUARIO', 'ADMINISTRADOR'])],
        schema: {
          tags: ['Solicitações'],
          summary: 'Cancela solicitação (USUARIO própria/PENDENTE; ADMIN qualquer)',
          params: idParamSchema,
          body: cancelarSolicitacaoBodySchema,
          response: { 200: solicitacaoDataResponseSchema },
        },
      },
      async (request) => {
        const sub = request.user?.sub ?? 'desconhecido'
        const ehAdmin = request.user?.roles.includes('ADMINISTRADOR') ?? false
        const data = await service.cancelar({
          id: request.params.id,
          canceladoPor: sub,
          motivo: request.body.motivo,
          papelDoCallerEhAdmin: ehAdmin,
          ip: request.ip ?? null,
          userAgent: request.headers['user-agent'] ?? null,
        })
        return { data }
      },
    )
  }
}
