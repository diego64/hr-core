import type { FastifyPluginAsync, FastifyPluginCallback } from 'fastify'
import fp from 'fastify-plugin'
import fastifyMetricsRaw, { type IMetricsPluginOptions } from 'fastify-metrics'
import promClient from 'prom-client'

import { env } from '../config/env.js'

const fastifyMetrics = fastifyMetricsRaw as unknown as FastifyPluginCallback<
  Partial<IMetricsPluginOptions>
>

const metrics: FastifyPluginAsync = async (fastify) => {
  if (env.NODE_ENV === 'test') {
    promClient.register.clear()
  }

  await fastify.register(fastifyMetrics, {
    endpoint: '/metrics',
    routeMetrics: {
      enabled: true,
      groupStatusCodes: true,
      registeredRoutesOnly: false,
    },
    defaultMetrics: {
      enabled: env.NODE_ENV !== 'test',
    },
  })
}

export default fp(metrics, { name: 'metrics' })
