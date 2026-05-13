import type { FastifyError, FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { ZodError, flattenError } from 'zod'

const PROBLEM_CONTENT_TYPE = 'application/problem+json'

const STATUS_TYPE_MAP: Readonly<Record<number, string>> = {
  400: 'https://hr-core/errors/bad-request',
  401: 'https://hr-core/errors/unauthorized',
  403: 'https://hr-core/errors/forbidden',
  404: 'https://hr-core/errors/not-found',
  409: 'https://hr-core/errors/conflict',
  422: 'https://hr-core/errors/unprocessable',
  429: 'https://hr-core/errors/rate-limit',
}

interface ProblemDetails {
  readonly type: string
  readonly title: string
  readonly status: number
  readonly detail?: string
  readonly instance?: string
  readonly traceId?: string
  readonly errors?: unknown
}

function buildProblem(partial: ProblemDetails): ProblemDetails {
  return partial
}

export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((error: FastifyError, request: FastifyRequest, reply: FastifyReply) => {
    const traceId = request.id

    if (error instanceof ZodError) {
      const problem = buildProblem({
        type: 'https://hr-core/errors/validation',
        title: 'Validation Failed',
        status: 400,
        detail: 'Request payload failed validation',
        instance: request.url,
        traceId,
        errors: flattenError(error).fieldErrors,
      })
      request.log.warn({ traceId, problem }, 'validation error')
      return reply.status(400).type(PROBLEM_CONTENT_TYPE).send(problem)
    }

    const status = error.statusCode ?? 500
    const isServerError = status >= 500

    const problem = buildProblem({
      type: isServerError
        ? 'https://hr-core/errors/internal'
        : (STATUS_TYPE_MAP[status] ?? `https://hr-core/errors/${status}`),
      title: error.name || (isServerError ? 'Internal Server Error' : 'Error'),
      status,
      detail: isServerError ? 'Internal server error' : error.message,
      instance: request.url,
      traceId,
    })

    if (isServerError) {
      request.log.error({ traceId, err: error }, 'unhandled error')
    } else {
      request.log.warn({ traceId, err: error }, 'request error')
    }

    return reply.status(status).type(PROBLEM_CONTENT_TYPE).send(problem)
  })

  app.setNotFoundHandler((request, reply) => {
    const problem = buildProblem({
      type: 'https://hr-core/errors/not-found',
      title: 'Not Found',
      status: 404,
      detail: `Route ${request.method} ${request.url} not found`,
      instance: request.url,
      traceId: request.id,
    })
    return reply.status(404).type(PROBLEM_CONTENT_TYPE).send(problem)
  })
}
