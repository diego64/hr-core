import swagger from '@fastify/swagger'
import swaggerUi from '@fastify/swagger-ui'
import type { FastifyPluginAsync } from 'fastify'
import fp from 'fastify-plugin'
import { jsonSchemaTransform } from 'fastify-type-provider-zod'
import type { OpenAPIV3 } from 'openapi-types'

import { env } from '../config/env.js'

interface ProxyDocRoute {
  readonly prefix: string
  readonly tag: string
  readonly tagDescription: string
  readonly upstreamEnvName: string
  readonly upstreamUrl: string | undefined
}

function buildProxyRoutes(): readonly ProxyDocRoute[] {
  return [
    {
      prefix: '/api/v1/funcionarios',
      tag: 'Funcionários',
      tagDescription:
        'Proxy para o Funcionario Service. Contrato completo publicado pelo próprio serviço.',
      upstreamEnvName: 'FUNCIONARIO_SERVICE_URL',
      upstreamUrl: env.FUNCIONARIO_SERVICE_URL,
    },
    {
      prefix: '/api/v1/ferias',
      tag: 'Férias',
      tagDescription:
        'Proxy para o Ferias Service. Contrato completo publicado pelo próprio serviço.',
      upstreamEnvName: 'FERIAS_SERVICE_URL',
      upstreamUrl: env.FERIAS_SERVICE_URL,
    },
    {
      prefix: '/api/v1/avaliacoes',
      tag: 'Avaliações',
      tagDescription:
        'Proxy para o Avaliacao Service. Contrato completo publicado pelo próprio serviço.',
      upstreamEnvName: 'AVALIACAO_SERVICE_URL',
      upstreamUrl: env.AVALIACAO_SERVICE_URL,
    },
    {
      prefix: '/api/v1/folha-de-pagamento',
      tag: 'Folha de Pagamento',
      tagDescription:
        'Proxy para o Folha de Pagamento Service. Contrato completo publicado pelo próprio serviço.',
      upstreamEnvName: 'FOLHA_PAGAMENTO_SERVICE_URL',
      upstreamUrl: env.FOLHA_PAGAMENTO_SERVICE_URL,
    },
  ]
}

const PROBLEM_SCHEMA: OpenAPIV3.SchemaObject = {
  type: 'object',
  required: ['type', 'title', 'status'],
  properties: {
    type: { type: 'string', format: 'uri', example: 'https://hr-core/errors/unauthorized' },
    title: { type: 'string', example: 'Unauthorized' },
    status: { type: 'integer', example: 401 },
    detail: { type: 'string', example: 'Missing or malformed Authorization header' },
    instance: { type: 'string', example: '/api/v1/funcionarios' },
    traceId: { type: 'string', format: 'uuid', example: '8a1c4f63-9c2e-4f3b-9a2e-3f8c1d2b7a6e' },
    errors: {
      type: 'object',
      additionalProperties: { type: 'array', items: { type: 'string' } },
      example: { nome: ['Required'] },
    },
  },
}

const problemResponse = (description: string): OpenAPIV3.ResponseObject => ({
  description,
  content: { 'application/problem+json': { schema: { $ref: '#/components/schemas/Problem' } } },
})

const PROBLEM_RESPONSES: Record<string, OpenAPIV3.ResponseObject> = {
  '401': problemResponse('Token ausente, malformado, inválido ou expirado'),
  '403': problemResponse('Role insuficiente para o endpoint'),
  '429': problemResponse('Rate limit excedido'),
  '5XX': problemResponse('Falha no gateway ou no microsserviço downstream'),
}

const PROXY_METHODS = ['get', 'post', 'put', 'patch', 'delete'] as const

const swaggerPlugin: FastifyPluginAsync = async (fastify) => {
  if (!env.SWAGGER_ENABLED) {
    fastify.log.info('swagger disabled (SWAGGER_ENABLED=false)')
    return
  }

  const proxyRoutes = buildProxyRoutes()
  const activeProxyRoutes = proxyRoutes.filter((r) => r.upstreamUrl !== undefined)

  await fastify.register(swagger, {
    openapi: {
      openapi: '3.1.0',
      info: {
        title: 'HR Core — API Gateway',
        description:
          'Ponto de entrada HTTP único do HR Core. Documenta o contrato exposto pelo gateway: ' +
          'rotas públicas de saúde/observabilidade e o contorno do proxy para os microsserviços. ' +
          'O contrato completo de cada microsserviço é publicado pelo próprio serviço — esta spec ' +
          'descreve apenas o que é responsabilidade do gateway (auth, rate-limit, propagação de identidade, ' +
          'formato de erro RFC 7807).',
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
        { name: 'System', description: 'Health, readiness, métricas. Públicos, sem autenticação.' },
        ...activeProxyRoutes.map((r) => ({ name: r.tag, description: r.tagDescription })),
      ],
      components: {
        securitySchemes: {
          bearerAuth: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT',
            description:
              'JWT RS256 emitido pelo Auth Service. O gateway valida assinatura (via JWKS), ' +
              '`iss`, `aud`, `exp` e propaga `x-user-id` / `x-user-roles` ao downstream.',
          },
        },
        schemas: { Problem: PROBLEM_SCHEMA },
      },
    },
    transform: jsonSchemaTransform,
    transformObject: (documentObject) => {
      if (!('openapiObject' in documentObject)) return documentObject.swaggerObject
      const openapiObject = documentObject.openapiObject
      openapiObject.paths = openapiObject.paths ?? {}

      for (const path of Object.keys(openapiObject.paths)) {
        if (activeProxyRoutes.some((r) => path.startsWith(r.prefix))) {
          delete openapiObject.paths[path]
        }
      }

      for (const route of activeProxyRoutes) {
        const path = `${route.prefix}/{rest}`
        const downstreamPath = route.prefix.replace('/api/v1', '')

        const operations: Record<string, unknown> = {}
        for (const method of PROXY_METHODS) {
          operations[method] = {
            tags: [route.tag],
            summary: `[Proxy] ${method.toUpperCase()} ${route.prefix}/{rest}`,
            description:
              `Encaminhado para \`${route.upstreamEnvName}\` (configurado como \`${route.upstreamUrl ?? ''}\`). ` +
              `Path reescrito para \`${downstreamPath}/{rest}\` no upstream. ` +
              'Headers injetados pelo gateway: `x-trace-id`, `x-user-id`, `x-user-roles`. ' +
              'O contrato de request/response (body, query, params além do `rest`) é definido pelo microsserviço.',
            security: [{ bearerAuth: [] }],
            parameters: [
              {
                name: 'rest',
                in: 'path',
                required: true,
                schema: { type: 'string' },
                description: 'Sub-path encaminhado ao microsserviço (pode conter `/`).',
              },
            ],
            responses: {
              '2XX': { description: 'Resposta do microsserviço downstream (contrato próprio).' },
              ...PROBLEM_RESPONSES,
            },
          }
        }

        openapiObject.paths[path] = operations
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
