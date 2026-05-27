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
    type: { type: 'string', format: 'uri', example: 'https://hr-core/errors/cpf-invalido' },
    title: { type: 'string', example: 'CPF inválido' },
    status: { type: 'integer', example: 422 },
    detail: { type: 'string', example: 'O CPF informado é inválido: 123.456.789-00' },
    instance: { type: 'string', example: '/funcionarios' },
    traceId: { type: 'string', format: 'uuid' },
    errors: {
      type: 'object',
      additionalProperties: { type: 'array', items: { type: 'string' } },
      example: { cpf: ['Required'] },
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
        title: 'HR Core — Funcionario Service',
        description:
          'Serviço de gestão do ciclo de vida do colaborador no HR Core. ' +
          'Cadastro, busca, listagem e desligamento; emite códigos legíveis ' +
          'FUN (derivado do CPF) e HR (sequencial). Autenticação via JWT ' +
          'RS256 do auth-service, verificado localmente por JWKS.',
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
          name: 'Funcionários',
          description:
            'CRUD do funcionário. Cadastro e desligamento exigem ADMINISTRADOR; ' +
            'listagem exige COORDENADOR ou ADMINISTRADOR; busca por ID exige ' +
            'qualquer usuário autenticado.',
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
        '404': problemResponse('Funcionário não encontrado'),
        '409': problemResponse('Conflito: CPF ou e-mail já cadastrado'),
        '422': problemResponse('CPF inválido'),
        '5XX': problemResponse('Falha interna do serviço'),
      }

      for (const [path, item] of Object.entries(openapiObject.paths ?? {})) {
        if (!path.startsWith('/funcionarios')) continue
        if (!item) continue
        for (const method of ['get', 'post', 'put', 'patch', 'delete'] as const) {
          const op = item[method]
          if (!op) continue
          op.responses = op.responses ?? {}
          for (const [status, response] of Object.entries(errorResponses)) {
            if (!op.responses[status]) op.responses[status] = response
          }
          // Funcionários requer bearer (handler decora preHandler com authenticate)
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
