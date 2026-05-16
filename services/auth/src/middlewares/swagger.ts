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
    type: { type: 'string', format: 'uri', example: 'https://hr-core/errors/invalid-credentials' },
    title: { type: 'string', example: 'Invalid credentials' },
    status: { type: 'integer', example: 401 },
    detail: { type: 'string', example: 'Invalid email or password' },
    instance: { type: 'string', example: '/auth/login' },
    traceId: { type: 'string', format: 'uuid', example: '8a1c4f63-9c2e-4f3b-9a2e-3f8c1d2b7a6e' },
    errors: {
      type: 'object',
      additionalProperties: { type: 'array', items: { type: 'string' } },
      example: { email: ['Invalid email'] },
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
        title: 'HR Core — Auth Service',
        description:
          'Serviço de autenticação do HR Core. Responsável por: criação e ' +
          'autenticação de usuários, rotação segura de refresh tokens com ' +
          'detecção de reuso, encerramento de sessão e publicação da chave ' +
          'pública via JWKS para os demais serviços.\n\n' +
          'O serviço **não** valida JWT de requests autenticadas — isso é ' +
          'responsabilidade de cada microsserviço consumidor (Zero Trust). ' +
          'O api-gateway baixa o JWKS daqui e verifica localmente.',
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
          description: 'Health, readiness, métricas e JWKS público. Todos sem autenticação.',
        },
        {
          name: 'Auth',
          description:
            'Registro, login, refresh token rotation, logout. Nenhuma rota exige ' +
            'autenticação prévia — register/login criam tokens, refresh/logout consomem ' +
            'um refresh token válido no body.',
        },
      ],
      components: {
        securitySchemes: {
          bearerAuth: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT',
            description:
              'JWT RS256 emitido por este Auth Service. Outros serviços do HR Core ' +
              'verificam a assinatura via o JWKS exposto em `/.well-known/jwks.json`.',
          },
        },
        schemas: { Problem: PROBLEM_SCHEMA },
      },
    },
    transform: jsonSchemaTransform,
    transformObject: (documentObject) => {
      if (!('openapiObject' in documentObject)) return documentObject.swaggerObject
      const openapiObject = documentObject.openapiObject

      // Anexa responses padronizadas (RFC 7807) em todas as operações Auth que
      // ainda não declararam essas respostas explicitamente. Mantém o contrato
      // visível na UI sem exigir que cada handler liste 401/409/etc.
      const errorResponses: Record<string, OpenAPIV3.ResponseObject> = {
        '400': problemResponse('Payload inválido (validação Zod)'),
        '401': problemResponse('Credenciais inválidas ou refresh token inválido/expirado/reusado'),
        '403': problemResponse('Usuário desativado'),
        '409': problemResponse('Email já cadastrado (apenas POST /auth/register)'),
        '5XX': problemResponse('Falha interna do serviço'),
      }

      for (const [path, item] of Object.entries(openapiObject.paths ?? {})) {
        if (!path.startsWith('/auth/')) continue
        if (!item) continue
        for (const method of ['get', 'post', 'put', 'patch', 'delete'] as const) {
          const op = item[method]
          if (!op) continue
          op.responses = op.responses ?? {}
          for (const [status, response] of Object.entries(errorResponses)) {
            if (!op.responses[status]) op.responses[status] = response
          }
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
