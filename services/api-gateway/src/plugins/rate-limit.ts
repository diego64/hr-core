import rateLimit from '@fastify/rate-limit'
import type { FastifyError, FastifyPluginAsync } from 'fastify'
import fp from 'fastify-plugin'

import { env } from '../config/env.js'

const rateLimitPlugin: FastifyPluginAsync = async (fastify) => {
  await fastify.register(rateLimit, {
    max: env.RATE_LIMIT_MAX,
    timeWindow: env.RATE_LIMIT_WINDOW_MS,
    errorResponseBuilder: (_request, context) => {
      const err = new Error(
        `Rate limit exceeded. Try again in ${Math.ceil(context.ttl / 1000)}s.`,
      ) as FastifyError
      err.name = 'Too Many Requests'
      err.statusCode = context.statusCode
      err.code = 'FST_TOO_MANY_REQUESTS'
      return err
    },
  })
}

export default fp(rateLimitPlugin, { name: 'rate-limit' })
