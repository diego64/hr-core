import type { FastifyPluginAsync, FastifyRequest, preHandlerAsyncHookHandler } from 'fastify'
import fp from 'fastify-plugin'

declare module 'fastify' {
  interface FastifyInstance {
    requireRole: (required: string | readonly string[]) => preHandlerAsyncHookHandler
  }
}

const rbacPlugin: FastifyPluginAsync = async (fastify) => {
  fastify.decorate('requireRole', function requireRole(required: string | readonly string[]) {
    const allowed = typeof required === 'string' ? [required] : [...required]

    return async function (request: FastifyRequest): Promise<void> {
      const user = request.user
      if (!user) {
        throw fastify.httpErrors.unauthorized('Authentication required')
      }

      const hasMatch = user.roles.some((r) => allowed.includes(r))
      if (!hasMatch) {
        throw fastify.httpErrors.forbidden(`Insufficient role. Required: ${allowed.join(' | ')}.`)
      }
    }
  })
}

export default fp(rbacPlugin, { name: 'rbac', dependencies: ['auth'] })
