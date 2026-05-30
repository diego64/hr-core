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
      example: 'https://hr-core/errors/folha-status-invalido',
    },
    title: { type: 'string', example: 'Status inválido para a operação' },
    status: { type: 'integer', example: 409 },
    detail: {
      type: 'string',
      example: 'Folha em estado APROVADA não pode receber novo lançamento de verba.',
    },
    instance: { type: 'string', example: '/folhas/abc/verbas' },
    traceId: { type: 'string', format: 'uuid' },
    errors: {
      type: 'object',
      additionalProperties: { type: 'array', items: { type: 'string' } },
      example: { competencia: ['Required'] },
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
        title: 'HR Core — Folha de Pagamento Service',
        description:
          'Serviço de folha de pagamento CLT do HR Core. Folha mensal, ' +
          'adiantamento, 13º (1ª e 2ª parcela) e registro de pagamento de ' +
          'férias originadas no ms-ferias. Cálculo progressivo de INSS e IRRF, ' +
          'FGTS como encargo patronal, código legível FOLHA sequencial. ' +
          'Autenticação via JWT RS256 do auth-service, verificado localmente ' +
          'por JWKS.',
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
        {
          name: 'System',
          description: 'Health, readiness, métricas. Públicos, sem autenticação.',
        },
        {
          name: 'Folhas',
          description:
            'Ciclo de vida da folha: abertura, lançamento de verbas, processamento, ' +
            'aprovação, confirmação de pagamento e fechamento. ' +
            'Processar/aprovar/rejeitar exigem COORDENADOR ou ADMINISTRADOR. ' +
            'Confirmar pagamento e fechar exigem ADMINISTRADOR.',
        },
        {
          name: 'Holerite',
          description:
            'Consulta do holerite por funcionário e competência. ' +
            'USUARIO consulta o próprio; COORDENADOR e ADMINISTRADOR consultam qualquer.',
        },
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
        '401': problemResponse('Token ausente, malformado, expirado ou inválido'),
        '403': problemResponse('Role insuficiente para a operação'),
        '404': problemResponse('Folha não encontrada'),
        '409': problemResponse(
          'Conflito: folha duplicada, transição inválida ou folha imutável (FECHADA)',
        ),
        '422': problemResponse(
          'Regras de domínio violadas (verba inválida, funcionário inativo, etc.)',
        ),
        '5XX': problemResponse('Falha interna do serviço'),
      }

      for (const [path, item] of Object.entries(openapiObject.paths ?? {})) {
        if (
          !path.startsWith('/folhas') &&
          !path.includes('/holerite/') &&
          !path.includes('/folhas')
        )
          continue
        if (!item) continue
        for (const method of ['get', 'post', 'put', 'patch', 'delete'] as const) {
          const op = item[method]
          if (!op) continue
          op.responses = op.responses ?? {}
          for (const [status, response] of Object.entries(errorResponses)) {
            if (!op.responses[status]) op.responses[status] = response
          }
          // Rotas protegidas exigem bearer (handler decora preHandler com authenticate)
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
