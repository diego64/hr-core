import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'

import type { AvaliadorService } from '../services/avaliador.service.js'
import {
  avaliadorDataResponseSchema,
  avaliadorListResponseSchema,
  criarAvaliadorBodySchema,
  idParamSchema,
  listarAvaliadoresQuerySchema,
} from '../schemas/avaliador.schema.js'

export function buildAvaliadorRoutes(service: AvaliadorService): FastifyPluginAsyncZod {
  return async (fastify) => {
    // GET /avaliadores (ADMIN)
    fastify.get(
      '/avaliadores',
      {
        preHandler: [fastify.authenticate, fastify.requireRole('ADMINISTRADOR')],
        schema: {
          tags: ['Avaliadores'],
          summary: 'Lista avaliadores (filtros: setor, ativo)',
          querystring: listarAvaliadoresQuerySchema,
          response: { 200: avaliadorListResponseSchema },
        },
      },
      async (request) => {
        const { setor, ativo } = request.query
        const data = await service.listar({
          ...(setor !== undefined ? { setor } : {}),
          ...(ativo !== undefined ? { ativo } : {}),
        })
        return { data }
      },
    )

    // GET /avaliadores/:id (ADMIN)
    fastify.get(
      '/avaliadores/:id',
      {
        preHandler: [fastify.authenticate, fastify.requireRole('ADMINISTRADOR')],
        schema: {
          tags: ['Avaliadores'],
          summary: 'Busca avaliador por ID',
          params: idParamSchema,
          response: { 200: avaliadorDataResponseSchema },
        },
      },
      async (request) => {
        const data = await service.buscarPorId(request.params.id)
        return { data }
      },
    )

    // POST /avaliadores (ADMIN)
    fastify.post(
      '/avaliadores',
      {
        preHandler: [fastify.authenticate, fastify.requireRole('ADMINISTRADOR')],
        schema: {
          tags: ['Avaliadores'],
          summary: 'Cria avaliador vinculado a um setor',
          body: criarAvaliadorBodySchema,
          response: { 201: avaliadorDataResponseSchema },
        },
      },
      async (request, reply) => {
        const sub = request.user?.sub ?? 'desconhecido'
        const data = await service.criar({
          usuarioId: request.body.usuarioId,
          nome: request.body.nome,
          email: request.body.email,
          setor: request.body.setor,
          criadoPor: sub,
          ip: request.ip ?? null,
          userAgent: request.headers['user-agent'] ?? null,
        })
        return reply.status(201).send({ data })
      },
    )

    // DELETE /avaliadores/:id (ADMIN — desativação)
    fastify.delete(
      '/avaliadores/:id',
      {
        preHandler: [fastify.authenticate, fastify.requireRole('ADMINISTRADOR')],
        schema: {
          tags: ['Avaliadores'],
          summary: 'Desativa avaliador (soft delete)',
          params: idParamSchema,
          response: { 200: avaliadorDataResponseSchema },
        },
      },
      async (request) => {
        const sub = request.user?.sub ?? 'desconhecido'
        const data = await service.desativar({
          id: request.params.id,
          desativadoPor: sub,
          ip: request.ip ?? null,
          userAgent: request.headers['user-agent'] ?? null,
        })
        return { data }
      },
    )
  }
}
