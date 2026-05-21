import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'

import type { FuncionarioService } from '../services/funcionario.service.js'
import {
  criarFuncionarioBodySchema,
  dataListResponseSchema,
  dataResponseSchema,
  idParamSchema,
  listarFuncionariosQuerySchema,
} from '../schemas/funcionario.schema.js'

export function buildFuncionarioRoutes(service: FuncionarioService): FastifyPluginAsyncZod {
  return async (fastify) => {
    // ─── POST /funcionarios  (USUARIO) ───────────────────────────────────
    fastify.post(
      '/',
      {
        preHandler: [fastify.authenticate, fastify.requireRole('USUARIO')],
        schema: {
          tags: ['Funcionários'],
          summary: 'Cria um novo funcionário (USUARIO)',
          description:
            'Cria o registro do funcionário, emite codigoFun (derivado do CPF) e ' +
            'codigoHR (sequencial atômico). Status inicial ATIVO. ' +
            'Operação executada pelo perfil operacional (USUARIO).',
          body: criarFuncionarioBodySchema,
          response: { 201: dataResponseSchema },
        },
      },
      async (request, reply) => {
        const { gestorId, ...rest } = request.body
        const funcionario = await service.criar({
          ...rest,
          gestorId: gestorId ?? null,
        })
        return reply.status(201).send({ data: funcionario })
      },
    )

    // ─── GET /funcionarios  (USUARIO, COORDENADOR) ───────────────────────
    fastify.get(
      '/',
      {
        preHandler: [fastify.authenticate, fastify.requireRole(['USUARIO', 'COORDENADOR'])],
        schema: {
          tags: ['Funcionários'],
          summary: 'Lista funcionários paginado (USUARIO ou COORDENADOR)',
          querystring: listarFuncionariosQuerySchema,
          response: { 200: dataListResponseSchema },
        },
      },
      async (request) => {
        const { page, limit, status, departamento } = request.query
        const filter = {
          ...(status !== undefined ? { status } : {}),
          ...(departamento !== undefined ? { departamento } : {}),
        }
        const result = await service.listar(filter, page, limit)
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

    // ─── GET /funcionarios/:id  (USUARIO, COORDENADOR) ───────────────────
    fastify.get(
      '/:id',
      {
        preHandler: [fastify.authenticate, fastify.requireRole(['USUARIO', 'COORDENADOR'])],
        schema: {
          tags: ['Funcionários'],
          summary: 'Busca funcionário por ID (USUARIO ou COORDENADOR)',
          params: idParamSchema,
          response: { 200: dataResponseSchema },
        },
      },
      async (request) => {
        const funcionario = await service.buscarPorId(request.params.id)
        return { data: funcionario }
      },
    )

    // ─── DELETE /funcionarios/:id  (USUARIO) ─────────────────────────────
    fastify.delete(
      '/:id',
      {
        preHandler: [fastify.authenticate, fastify.requireRole('USUARIO')],
        schema: {
          tags: ['Funcionários'],
          summary: 'Desliga funcionário (soft delete, USUARIO)',
          description:
            'Marca o funcionário como DESLIGADO. Idempotente do ponto de vista ' +
            'do cliente: tentativa em alguém já DESLIGADO retorna 409.',
          params: idParamSchema,
          // Sem declaração de schema para 204 — corpo vazio é o default do
          // Fastify e o jsonSchemaTransform do fastify-type-provider-zod não
          // aceita { type: 'object' } cru (precisaria ser um Zod schema).
        },
      },
      async (request, reply) => {
        await service.desligar(request.params.id)
        return reply.status(204).send()
      },
    )
  }
}
