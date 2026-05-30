import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'

import type { AvaliacaoService } from '../services/avaliacao.service.js'
import {
  avaliacaoDataResponseSchema,
  avaliacaoListResponseSchema,
  avaliadorIdParamSchema,
  codigoFunParamSchema,
  codigoParamSchema,
  criarAvaliacaoBodySchema,
  editarAvaliacaoBodySchema,
  idParamSchema,
  listarAvaliacoesQuerySchema,
  setorParamSchema,
} from '../schemas/avaliacao.schema.js'

export function buildAvaliacaoRoutes(service: AvaliacaoService): FastifyPluginAsyncZod {
  return async (fastify) => {
    // ─── GET /avaliacoes (ADMIN — lista global) ────────────────────────
    fastify.get(
      '/avaliacoes',
      {
        preHandler: [fastify.authenticate, fastify.requireRole('ADMINISTRADOR')],
        schema: {
          tags: ['Avaliações'],
          summary: 'Lista todas as avaliações (ADMIN)',
          querystring: listarAvaliacoesQuerySchema,
          response: { 200: avaliacaoListResponseSchema },
        },
      },
      async (request) => {
        const { page, limit } = request.query
        const data = await service.listar({ filtros: {}, page, limit })
        return {
          data: data.items,
          meta: { total: data.total, page: data.page, limit: data.limit, pages: data.pages },
        }
      },
    )

    // ─── GET /avaliacoes/:id ───────────────────────────────────────────
    fastify.get(
      '/avaliacoes/:id',
      {
        preHandler: [
          fastify.authenticate,
          fastify.requireRole(['ADMINISTRADOR', 'COORDENADOR', 'AVALIADOR', 'USUARIO']),
        ],
        schema: {
          tags: ['Avaliações'],
          summary: 'Busca avaliação por ID',
          params: idParamSchema,
          response: { 200: avaliacaoDataResponseSchema },
        },
      },
      async (request) => {
        const data = await service.buscarPorId(request.params.id)
        return { data }
      },
    )

    // ─── GET /avaliacoes/codigo/:codigo ────────────────────────────────
    fastify.get(
      '/avaliacoes/codigo/:codigo',
      {
        preHandler: [
          fastify.authenticate,
          fastify.requireRole(['ADMINISTRADOR', 'COORDENADOR', 'AVALIADOR', 'USUARIO']),
        ],
        schema: {
          tags: ['Avaliações'],
          summary: 'Busca avaliação por código AVAL000001',
          params: codigoParamSchema,
          response: { 200: avaliacaoDataResponseSchema },
        },
      },
      async (request) => {
        const data = await service.buscarPorCodigo(request.params.codigo)
        return { data }
      },
    )

    // ─── GET /funcionarios/:codigoFun/avaliacoes ───────────────────────
    fastify.get(
      '/funcionarios/:codigoFun/avaliacoes',
      {
        preHandler: [
          fastify.authenticate,
          fastify.requireRole(['ADMINISTRADOR', 'COORDENADOR', 'USUARIO']),
        ],
        schema: {
          tags: ['Avaliações'],
          summary: 'Lista avaliações de um funcionário',
          params: codigoFunParamSchema,
          querystring: listarAvaliacoesQuerySchema,
          response: { 200: avaliacaoListResponseSchema },
        },
      },
      async (request) => {
        const { page, limit } = request.query
        const data = await service.listar({
          filtros: { codigoFun: request.params.codigoFun },
          page,
          limit,
        })
        return {
          data: data.items,
          meta: { total: data.total, page: data.page, limit: data.limit, pages: data.pages },
        }
      },
    )

    // ─── GET /setores/:setor/avaliacoes ────────────────────────────────
    fastify.get(
      '/setores/:setor/avaliacoes',
      {
        preHandler: [fastify.authenticate, fastify.requireRole(['ADMINISTRADOR', 'COORDENADOR'])],
        schema: {
          tags: ['Avaliações'],
          summary: 'Lista avaliações por setor',
          params: setorParamSchema,
          querystring: listarAvaliacoesQuerySchema,
          response: { 200: avaliacaoListResponseSchema },
        },
      },
      async (request) => {
        const { page, limit } = request.query
        const data = await service.listar({
          filtros: { setor: request.params.setor },
          page,
          limit,
        })
        return {
          data: data.items,
          meta: { total: data.total, page: data.page, limit: data.limit, pages: data.pages },
        }
      },
    )

    // ─── GET /avaliadores/:avaliadorId/avaliacoes ──────────────────────
    fastify.get(
      '/avaliadores/:avaliadorId/avaliacoes',
      {
        preHandler: [fastify.authenticate, fastify.requireRole(['ADMINISTRADOR', 'AVALIADOR'])],
        schema: {
          tags: ['Avaliações'],
          summary: 'Lista avaliações criadas por um avaliador',
          params: avaliadorIdParamSchema,
          querystring: listarAvaliacoesQuerySchema,
          response: { 200: avaliacaoListResponseSchema },
        },
      },
      async (request) => {
        const { page, limit } = request.query
        const data = await service.listar({
          filtros: { avaliadorId: request.params.avaliadorId },
          page,
          limit,
        })
        return {
          data: data.items,
          meta: { total: data.total, page: data.page, limit: data.limit, pages: data.pages },
        }
      },
    )

    // ─── POST /avaliacoes (AVALIADOR) ──────────────────────────────────
    fastify.post(
      '/avaliacoes',
      {
        preHandler: [fastify.authenticate, fastify.requireRole('AVALIADOR')],
        schema: {
          tags: ['Avaliações'],
          summary: 'Cria avaliação (AVALIADOR para funcionário do próprio setor)',
          body: criarAvaliacaoBodySchema,
          response: { 201: avaliacaoDataResponseSchema },
        },
      },
      async (request, reply) => {
        const sub = request.user?.sub ?? 'desconhecido'
        const data = await service.criar({
          avaliadorUsuarioId: sub,
          codigoFun: request.body.codigoFun,
          titulo: request.body.titulo,
          comentario: request.body.comentario,
          nota: request.body.nota,
          ip: request.ip ?? null,
          userAgent: request.headers['user-agent'] ?? null,
        })
        return reply.status(201).send({ data })
      },
    )

    // ─── PUT /avaliacoes/:id (AVALIADOR dono | ADMIN) ──────────────────
    fastify.put(
      '/avaliacoes/:id',
      {
        preHandler: [fastify.authenticate, fastify.requireRole(['AVALIADOR', 'ADMINISTRADOR'])],
        schema: {
          tags: ['Avaliações'],
          summary: 'Edita título/comentário/nota da avaliação',
          params: idParamSchema,
          body: editarAvaliacaoBodySchema,
          response: { 200: avaliacaoDataResponseSchema },
        },
      },
      async (request) => {
        const sub = request.user?.sub ?? 'desconhecido'
        const ehAdmin = request.user?.roles.includes('ADMINISTRADOR') ?? false
        const data = await service.editar({
          id: request.params.id,
          editorUsuarioId: sub,
          editorEhAdmin: ehAdmin,
          ...(request.body.titulo !== undefined ? { titulo: request.body.titulo } : {}),
          ...(request.body.comentario !== undefined ? { comentario: request.body.comentario } : {}),
          ...(request.body.nota !== undefined ? { nota: request.body.nota } : {}),
          ip: request.ip ?? null,
          userAgent: request.headers['user-agent'] ?? null,
        })
        return { data }
      },
    )
  }
}
