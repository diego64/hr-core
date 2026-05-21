import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'

import type { AprovacaoService } from '../services/aprovacao.service.js'
import {
  aprovacaoDataResponseSchema,
  aprovacaoListResponseSchema,
  idParamSchema,
  listarAprovacoesQuerySchema,
  patchFuncionarioBodySchema,
  rejeitarAprovacaoBodySchema,
} from '../schemas/aprovacao.schema.js'

export function buildAprovacaoRoutes(service: AprovacaoService): FastifyPluginAsyncZod {
  return async (fastify) => {
    // ─── PATCH /funcionarios/:id  (USUARIO, cria Aprovacao PENDENTE) ─────
    fastify.patch(
      '/funcionarios/:id',
      {
        preHandler: [fastify.authenticate, fastify.requireRole('USUARIO')],
        schema: {
          tags: ['Aprovações'],
          summary: 'Solicita alteração cadastral (USUARIO — não aplica direto)',
          description:
            'Cria uma Aprovacao PENDENTE com o payload solicitado. Só vira ' +
            'efetiva após POST /aprovacoes/:id/aprovar [COORDENADOR]. ' +
            'Campos aceitos: telefone, cargo, departamento, gestorId.',
          params: idParamSchema,
          body: patchFuncionarioBodySchema,
          response: { 202: aprovacaoDataResponseSchema },
        },
      },
      async (request, reply) => {
        const sub = request.user?.sub ?? 'desconhecido'
        const aprov = await service.solicitar({
          funcionarioId: request.params.id,
          camposAlterados: request.body,
          solicitadoPor: sub,
        })
        return reply.status(202).send({ data: aprov })
      },
    )

    // ─── GET /aprovacoes  (COORDENADOR) ──────────────────────────────────
    fastify.get(
      '/aprovacoes',
      {
        preHandler: [fastify.authenticate, fastify.requireRole('COORDENADOR')],
        schema: {
          tags: ['Aprovações'],
          summary: 'Lista aprovações cadastrais (COORDENADOR)',
          querystring: listarAprovacoesQuerySchema,
          response: { 200: aprovacaoListResponseSchema },
        },
      },
      async (request) => {
        const data = await service.listar(request.query)
        return { data }
      },
    )

    // ─── GET /aprovacoes/:id  (COORDENADOR) ──────────────────────────────
    fastify.get(
      '/aprovacoes/:id',
      {
        preHandler: [fastify.authenticate, fastify.requireRole('COORDENADOR')],
        schema: {
          tags: ['Aprovações'],
          summary: 'Detalha uma aprovação por id (COORDENADOR)',
          params: idParamSchema,
          response: { 200: aprovacaoDataResponseSchema },
        },
      },
      async (request) => {
        const data = await service.buscarPorId(request.params.id)
        return { data }
      },
    )

    // ─── POST /aprovacoes/:id/aprovar  (COORDENADOR) ─────────────────────
    fastify.post(
      '/aprovacoes/:id/aprovar',
      {
        preHandler: [fastify.authenticate, fastify.requireRole('COORDENADOR')],
        schema: {
          tags: ['Aprovações'],
          summary: 'Aprova alteração cadastral — aplica payload no funcionário',
          params: idParamSchema,
          response: { 200: aprovacaoDataResponseSchema },
        },
      },
      async (request) => {
        const sub = request.user?.sub ?? 'desconhecido'
        const data = await service.aprovar(request.params.id, sub)
        return { data }
      },
    )

    // ─── POST /aprovacoes/:id/rejeitar (COORDENADOR) ─────────────────────
    fastify.post(
      '/aprovacoes/:id/rejeitar',
      {
        preHandler: [fastify.authenticate, fastify.requireRole('COORDENADOR')],
        schema: {
          tags: ['Aprovações'],
          summary: 'Rejeita alteração cadastral com motivo (COORDENADOR)',
          params: idParamSchema,
          body: rejeitarAprovacaoBodySchema,
          response: { 200: aprovacaoDataResponseSchema },
        },
      },
      async (request) => {
        const sub = request.user?.sub ?? 'desconhecido'
        const data = await service.rejeitar(request.params.id, sub, request.body.motivo)
        return { data }
      },
    )
  }
}
