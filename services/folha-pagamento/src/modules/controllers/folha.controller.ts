import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'

import {
  abrirFolhaBodySchema,
  codigoFunCompetenciaParamSchema,
  codigoFunParamSchema,
  codigoParamSchema,
  competenciaParamSchema,
  folhaDataResponseSchema,
  folhaListResponseSchema,
  idParamSchema,
  lancarVerbaBodySchema,
  listarFolhasQuerySchema,
  rejeitarFolhaBodySchema,
  verbaParamSchema,
} from '../schemas/folha.schema.js'
import type { FolhaService } from '../services/folha.service.js'

export function buildFolhaRoutes(service: FolhaService): FastifyPluginAsyncZod {
  return async (fastify) => {
    // Listagens
    fastify.get(
      '/folhas',
      {
        preHandler: [fastify.authenticate, fastify.requireRole(['COORDENADOR', 'ADMINISTRADOR'])],
        schema: {
          tags: ['Folhas'],
          summary: 'Lista folhas com filtros',
          querystring: listarFolhasQuerySchema,
          response: { 200: folhaListResponseSchema },
        },
      },
      async (request) => {
        const { status, tipo, funcionarioId, codigoFun, competencia, page, limit } = request.query
        const result = await service.listar(
          {
            ...(status !== undefined ? { status } : {}),
            ...(tipo !== undefined ? { tipo } : {}),
            ...(funcionarioId !== undefined ? { funcionarioId } : {}),
            ...(codigoFun !== undefined ? { codigoFun } : {}),
            ...(competencia !== undefined ? { competencia } : {}),
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

    fastify.get(
      '/folhas/:id',
      {
        preHandler: [fastify.authenticate],
        schema: {
          tags: ['Folhas'],
          summary: 'Busca folha por ID',
          params: idParamSchema,
          response: { 200: folhaDataResponseSchema },
        },
      },
      async (request) => {
        const data = await service.buscarPorId(request.params.id)
        return { data }
      },
    )

    fastify.get(
      '/folhas/codigo/:codigo',
      {
        preHandler: [fastify.authenticate],
        schema: {
          tags: ['Folhas'],
          summary: 'Busca folha por código legível (FOLHA000001)',
          params: codigoParamSchema,
          response: { 200: folhaDataResponseSchema },
        },
      },
      async (request) => {
        const data = await service.buscarPorCodigo(request.params.codigo)
        return { data }
      },
    )

    fastify.get(
      '/funcionarios/:codigoFun/folhas',
      {
        preHandler: [fastify.authenticate],
        schema: {
          tags: ['Folhas'],
          summary: 'Histórico de folhas do funcionário',
          params: codigoFunParamSchema,
          querystring: listarFolhasQuerySchema,
          response: { 200: folhaListResponseSchema },
        },
      },
      async (request) => {
        const { status, tipo, competencia, page, limit } = request.query
        const result = await service.listar(
          {
            codigoFun: request.params.codigoFun,
            ...(status !== undefined ? { status } : {}),
            ...(tipo !== undefined ? { tipo } : {}),
            ...(competencia !== undefined ? { competencia } : {}),
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

    fastify.get(
      '/competencias/:competencia/folhas',
      {
        preHandler: [fastify.authenticate, fastify.requireRole(['COORDENADOR', 'ADMINISTRADOR'])],
        schema: {
          tags: ['Folhas'],
          summary: 'Folhas de uma competência (mês/ano)',
          params: competenciaParamSchema,
          querystring: listarFolhasQuerySchema,
          response: { 200: folhaListResponseSchema },
        },
      },
      async (request) => {
        const { status, tipo, page, limit } = request.query
        const result = await service.listar(
          {
            competencia: request.params.competencia,
            ...(status !== undefined ? { status } : {}),
            ...(tipo !== undefined ? { tipo } : {}),
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

    // Ações
    fastify.post(
      '/folhas',
      {
        preHandler: [fastify.authenticate, fastify.requireRole(['COORDENADOR', 'ADMINISTRADOR'])],
        schema: {
          tags: ['Folhas'],
          summary: 'Abre uma nova folha',
          body: abrirFolhaBodySchema,
          response: { 201: folhaDataResponseSchema },
        },
      },
      async (request, reply) => {
        const sub = request.user?.sub ?? 'desconhecido'
        const data = await service.abrir({
          codigoFun: request.body.codigoFun,
          tipo: request.body.tipo,
          competencia: request.body.competencia,
          abertaPor: sub,
          ip: request.ip,
          userAgent: request.headers['user-agent'] ?? null,
        })
        return reply.status(201).send({ data })
      },
    )

    fastify.post(
      '/folhas/:id/verbas',
      {
        preHandler: [fastify.authenticate, fastify.requireRole(['COORDENADOR', 'ADMINISTRADOR'])],
        schema: {
          tags: ['Folhas'],
          summary: 'Lança verba (provento ou desconto variável)',
          params: idParamSchema,
          body: lancarVerbaBodySchema,
          response: { 200: folhaDataResponseSchema },
        },
      },
      async (request) => {
        const sub = request.user?.sub ?? 'sistema'
        const data = await service.lancarVerba({
          folhaId: request.params.id,
          codigo: request.body.codigo,
          valor: request.body.valor,
          descricao: request.body.descricao ?? null,
          referencia: request.body.referencia ?? null,
          usuarioId: sub,
          ip: request.ip,
          userAgent: request.headers['user-agent'] ?? null,
        })
        return { data }
      },
    )

    fastify.delete(
      '/folhas/:id/verbas/:codigoVerba',
      {
        preHandler: [fastify.authenticate, fastify.requireRole(['COORDENADOR', 'ADMINISTRADOR'])],
        schema: {
          tags: ['Folhas'],
          summary: 'Remove verba lançada',
          params: verbaParamSchema,
          response: { 200: folhaDataResponseSchema },
        },
      },
      async (request) => {
        const sub = request.user?.sub ?? 'sistema'
        const data = await service.removerVerba({
          folhaId: request.params.id,
          codigoVerba: request.params.codigoVerba,
          usuarioId: sub,
          ip: request.ip,
          userAgent: request.headers['user-agent'] ?? null,
        })
        return { data }
      },
    )

    fastify.post(
      '/folhas/:id/processar',
      {
        preHandler: [fastify.authenticate, fastify.requireRole(['COORDENADOR', 'ADMINISTRADOR'])],
        schema: {
          tags: ['Folhas'],
          summary: 'Processa cálculos (INSS/IRRF/FGTS/líquido)',
          params: idParamSchema,
          response: { 200: folhaDataResponseSchema },
        },
      },
      async (request) => {
        const sub = request.user?.sub ?? 'sistema'
        const data = await service.processar({
          folhaId: request.params.id,
          usuarioId: sub,
          ip: request.ip,
          userAgent: request.headers['user-agent'] ?? null,
        })
        return { data }
      },
    )

    fastify.post(
      '/folhas/:id/aprovar',
      {
        preHandler: [fastify.authenticate, fastify.requireRole(['COORDENADOR', 'ADMINISTRADOR'])],
        schema: {
          tags: ['Folhas'],
          summary: 'Aprova folha PROCESSADA',
          params: idParamSchema,
          response: { 200: folhaDataResponseSchema },
        },
      },
      async (request) => {
        const sub = request.user?.sub ?? 'sistema'
        const data = await service.aprovar({
          folhaId: request.params.id,
          usuarioId: sub,
          ip: request.ip,
          userAgent: request.headers['user-agent'] ?? null,
        })
        return { data }
      },
    )

    fastify.post(
      '/folhas/:id/rejeitar',
      {
        preHandler: [fastify.authenticate, fastify.requireRole(['COORDENADOR', 'ADMINISTRADOR'])],
        schema: {
          tags: ['Folhas'],
          summary: 'Rejeita folha com justificativa',
          params: idParamSchema,
          body: rejeitarFolhaBodySchema,
          response: { 200: folhaDataResponseSchema },
        },
      },
      async (request) => {
        const sub = request.user?.sub ?? 'sistema'
        const data = await service.rejeitar({
          folhaId: request.params.id,
          usuarioId: sub,
          justificativa: request.body.justificativa,
          ip: request.ip,
          userAgent: request.headers['user-agent'] ?? null,
        })
        return { data }
      },
    )

    fastify.post(
      '/folhas/:id/confirmar-pagamento',
      {
        preHandler: [fastify.authenticate, fastify.requireRole('ADMINISTRADOR')],
        schema: {
          tags: ['Folhas'],
          summary: 'Confirma efetivação do pagamento',
          params: idParamSchema,
          response: { 200: folhaDataResponseSchema },
        },
      },
      async (request) => {
        const sub = request.user?.sub ?? 'sistema'
        const data = await service.confirmarPagamento({
          folhaId: request.params.id,
          usuarioId: sub,
          ip: request.ip,
          userAgent: request.headers['user-agent'] ?? null,
        })
        return { data }
      },
    )

    fastify.post(
      '/folhas/:id/fechar',
      {
        preHandler: [fastify.authenticate, fastify.requireRole('ADMINISTRADOR')],
        schema: {
          tags: ['Folhas'],
          summary: 'Fecha folha definitivamente (imutável)',
          params: idParamSchema,
          response: { 200: folhaDataResponseSchema },
        },
      },
      async (request) => {
        const sub = request.user?.sub ?? 'sistema'
        const data = await service.fechar({
          folhaId: request.params.id,
          usuarioId: sub,
          ip: request.ip,
          userAgent: request.headers['user-agent'] ?? null,
        })
        return { data }
      },
    )

    // Holerite
    fastify.get(
      '/funcionarios/:codigoFun/holerite/:competencia',
      {
        preHandler: [fastify.authenticate],
        schema: {
          tags: ['Holerite'],
          summary: 'Holerite do funcionário na competência',
          params: codigoFunCompetenciaParamSchema,
          response: { 200: folhaDataResponseSchema },
        },
      },
      async (request) => {
        const data = await service.buscarHolerite(
          request.params.codigoFun,
          request.params.competencia,
        )
        return { data }
      },
    )
  }
}
