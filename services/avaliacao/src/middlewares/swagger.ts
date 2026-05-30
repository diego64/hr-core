import swagger from '@fastify/swagger'
import swaggerUi from '@fastify/swagger-ui'
import type { FastifyPluginAsync } from 'fastify'
import fp from 'fastify-plugin'
import { jsonSchemaTransform } from 'fastify-type-provider-zod'
import type { OpenAPIV3 } from 'openapi-types'

import { env } from '../config/env.js'

const PROBLEM_SCHEMA: OpenAPIV3.SchemaObject = {
  type: 'object',
  required: ['type', 'title', 'status'],
  properties: {
    type: {
      type: 'string',
      format: 'uri',
      example: 'https://hr-core/errors/avaliacao.nota-invalida',
    },
    title: { type: 'string', example: 'Nota inválida' },
    status: { type: 'integer', example: 422 },
    detail: { type: 'string', example: 'Nota precisa ser um inteiro entre 1 e 5. Recebido: 6.' },
    instance: { type: 'string', example: '/avaliacoes' },
    traceId: { type: 'string', format: 'uuid' },
    errors: {
      type: 'object',
      additionalProperties: { type: 'array', items: { type: 'string' } },
    },
  },
}

const problemResponse = (description: string): OpenAPIV3.ResponseObject => ({
  description,
  content: { 'application/problem+json': { schema: { $ref: '#/components/schemas/Problem' } } },
})

const swaggerPlugin: FastifyPluginAsync = async (fastify) => {
  if (!env.SWAGGER_ENABLED) {
    fastify.log.info('swagger disabled (SWAGGER_ENABLED=false)')
    return
  }

  await fastify.register(swagger, {
    openapi: {
      openapi: '3.1.0',
      info: {
        title: 'HR Core — Avaliacao Service',
        description:
          'Serviço de avaliação de desempenho do HR Core. O ADMINISTRADOR ' +
          'cria avaliadores vinculados a setores. O AVALIADOR avalia ' +
          'funcionários do próprio setor com título, comentário e nota 1-5. ' +
          'Autenticação via JWT RS256 do auth-service, verificado por JWKS.',
        version: process.env.npm_package_version ?? '0.0.0',
        license: { name: 'Proprietário', url: 'https://hr-core.local' },
      },
      servers: [
        {
          url: `http://${env.HOST === '0.0.0.0' ? 'localhost' : env.HOST}:${env.PORT}`,
          description: 'Local',
        },
      ],
      tags: [
        { name: 'System', description: 'Health, readiness, métricas. Sem autenticação.' },
        { name: 'Avaliadores', description: 'CRUD de avaliadores. ADMINISTRADOR.' },
        { name: 'Avaliações', description: 'CRUD de avaliações com validação de setor.' },
      ],
      components: {
        securitySchemes: {
          bearerAuth: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT',
            description: 'JWT RS256 emitido pelo auth-service.',
          },
        },
        schemas: { Problem: PROBLEM_SCHEMA },
      },
    },
    transform: jsonSchemaTransform,
    transformObject: (documentObject) => {
      if (!('openapiObject' in documentObject)) return documentObject.swaggerObject
      const openapiObject = documentObject.openapiObject

      const errorResponses: Record<string, OpenAPIV3.ResponseObject> = {
        '400': problemResponse('Payload inválido (validação Zod)'),
        '401': problemResponse('Token ausente, malformado ou inválido'),
        '403': problemResponse('Role insuficiente / setor não autorizado'),
        '404': problemResponse('Recurso não encontrado'),
        '409': problemResponse('Conflito (ex.: avaliador já existe para o usuário)'),
        '422': problemResponse('Regra de domínio violada (nota, título, comentário, setor)'),
        '5XX': problemResponse('Falha interna do serviço'),
      }

      for (const [path, item] of Object.entries(openapiObject.paths ?? {})) {
        if (
          !path.startsWith('/avaliadores') &&
          !path.startsWith('/avaliacoes') &&
          !path.startsWith('/funcionarios') &&
          !path.startsWith('/setores')
        ) {
          continue
        }
        if (!item) continue
        for (const method of ['get', 'post', 'put', 'patch', 'delete'] as const) {
          const op = item[method]
          if (!op) continue
          op.responses = op.responses ?? {}
          for (const [status, response] of Object.entries(errorResponses)) {
            if (!op.responses[status]) op.responses[status] = response
          }
          op.security = op.security ?? [{ bearerAuth: [] }]
        }
      }

      return openapiObject
    },
  })

  await fastify.register(swaggerUi, {
    routePrefix: env.SWAGGER_ROUTE_PREFIX,
    uiConfig: {
      docExpansion: 'list',
      deepLinking: true,
      persistAuthorization: true,
      tryItOutEnabled: true,
    },
    staticCSP: true,
  })
}

export default fp(swaggerPlugin, { name: 'swagger' })
