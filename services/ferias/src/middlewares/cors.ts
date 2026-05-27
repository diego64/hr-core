import cors, { type FastifyCorsOptions } from '@fastify/cors'
import type { FastifyPluginAsync } from 'fastify'
import fp from 'fastify-plugin'

import { env } from '../config/env.js'

type CorsOrigin = NonNullable<FastifyCorsOptions['origin']>

function parseOrigins(raw: string): CorsOrigin {
  const trimmed = raw.trim()
  if (trimmed.length === 0) return false
  if (trimmed === '*') return true

  const list = trimmed
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)

  if (list.length === 0) return false

  return (origin, cb) => {
    if (!origin) {
      cb(null, true)
      return
    }
    cb(null, list.includes(origin))
  }
}

const corsPlugin: FastifyPluginAsync = async (fastify) => {
  const origin = parseOrigins(env.CORS_ORIGINS)

  if (origin === false) {
    fastify.log.warn('CORS disabled: CORS_ORIGINS is empty')
    return
  }

  await fastify.register(cors, {
    origin,
    credentials: env.CORS_CREDENTIALS,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Trace-Id'],
    exposedHeaders: ['X-Trace-Id'],
    maxAge: env.CORS_MAX_AGE,
    strictPreflight: false,
  })
}

export default fp(corsPlugin, { name: 'cors' })
