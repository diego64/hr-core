import httpProxy from '@fastify/http-proxy'
import type { FastifyPluginAsync } from 'fastify'

import { env } from '../config/env.js'

interface DownstreamRoute {
  readonly prefix: string
  readonly rewritePrefix: string
  readonly upstream: string
}

function buildRoutes(): readonly DownstreamRoute[] {
  const routes: DownstreamRoute[] = [
    {
      prefix: '/api/v1/funcionarios',
      rewritePrefix: '/funcionarios',
      upstream: env.FUNCIONARIO_SERVICE_URL,
    },
  ]

  if (env.FERIAS_SERVICE_URL) {
    routes.push({
      prefix: '/api/v1/ferias',
      rewritePrefix: '/ferias',
      upstream: env.FERIAS_SERVICE_URL,
    })
  }
  if (env.AVALIACAO_SERVICE_URL) {
    routes.push({
      prefix: '/api/v1/avaliacoes',
      rewritePrefix: '/avaliacoes',
      upstream: env.AVALIACAO_SERVICE_URL,
    })
  }
  if (env.FOLHA_PAGAMENTO_SERVICE_URL) {
    routes.push({
      prefix: '/api/v1/folha-de-pagamento',
      rewritePrefix: '/folha-de-pagamento',
      upstream: env.FOLHA_PAGAMENTO_SERVICE_URL,
    })
  }

  return routes
}

export const proxyRoutes: FastifyPluginAsync = async (fastify) => {
  for (const route of buildRoutes()) {
    await fastify.register(httpProxy, {
      upstream: route.upstream,
      prefix: route.prefix,
      rewritePrefix: route.rewritePrefix,
      preHandler: fastify.authenticate,
      replyOptions: {
        rewriteRequestHeaders: (request, headers) => ({
          ...headers,
          'x-trace-id': request.id,
          'x-user-id': request.user?.sub ?? '',
          'x-user-roles': (request.user?.roles ?? []).join(','),
        }),
      },
    })
  }
}
