import { randomUUID } from 'node:crypto'

import multipart from '@fastify/multipart'
import sensible from '@fastify/sensible'
import Fastify, { type FastifyInstance } from 'fastify'
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod'
import type { Db } from 'mongodb'

import { env } from './config/env.js'
import authPlugin from './middlewares/auth.js'
import corsPlugin from './middlewares/cors.js'
import { registerErrorHandler } from './middlewares/error-handler.js'
import metricsPlugin from './middlewares/metrics.js'
import swaggerPlugin from './middlewares/swagger.js'
import { buildAprovacaoRoutes } from './modules/controllers/aprovacao.controller.js'
import { buildDocumentoRoutes } from './modules/controllers/documento.controller.js'
import { buildFuncionarioRoutes } from './modules/controllers/funcionario.controller.js'
import { healthRoutes } from './modules/controllers/health.controller.js'
import { AprovacaoRepository } from './modules/repositories/aprovacao.repository.js'
import { ContadorRepository } from './modules/repositories/contador.repository.js'
import { DocumentoRepository } from './modules/repositories/documento.repository.js'
import { FuncionarioRepository } from './modules/repositories/funcionario.repository.js'
import { AprovacaoService } from './modules/services/aprovacao.service.js'
import {
  DocumentoService,
  MAX_UPLOAD_BYTES,
  type StoragePort,
} from './modules/services/documento.service.js'
import { FuncionarioService } from './modules/services/funcionario.service.js'
import * as s3 from './storage/s3.js'

export interface BuildAppDeps {
  readonly db: Db
  /**
   * Injeção opcional de storage. Em produção o default é o `storage/s3.ts`
   * (MinIO/S3). Em tests, os arquivos `*.test.ts` passam um stub para evitar
   * dependência de MinIO real.
   */
  readonly storage?: StoragePort
}

export async function buildApp(deps: BuildAppDeps): Promise<FastifyInstance> {
  const useTransport = env.NODE_ENV === 'development'

  const app = Fastify({
    logger: {
      level: env.LOG_LEVEL,
      ...(useTransport
        ? { transport: { target: 'pino-pretty', options: { translateTime: 'SYS:standard' } } }
        : {}),
      base: { service: 'funcionario' },
    },
    genReqId: (req) => {
      const incoming = req.headers['x-trace-id']
      if (typeof incoming === 'string' && incoming.length > 0) return incoming
      return randomUUID()
    },
    trustProxy: true,
    disableRequestLogging: false,
    // Limite global de body — multipart respeita via plugin abaixo.
    bodyLimit: MAX_UPLOAD_BYTES,
  })

  app.setValidatorCompiler(validatorCompiler)
  app.setSerializerCompiler(serializerCompiler)
  const typed = app.withTypeProvider<ZodTypeProvider>()

  registerErrorHandler(typed)
  await typed.register(sensible)
  await typed.register(metricsPlugin)
  await typed.register(corsPlugin)
  await typed.register(authPlugin)
  await typed.register(multipart, {
    limits: {
      fileSize: MAX_UPLOAD_BYTES,
      files: 1, // só aceita 1 arquivo por request
      fields: 10,
    },
  })
  await typed.register(swaggerPlugin)

  // Bootstrap dos services (singleton no app)
  const funcionarioRepo = new FuncionarioRepository(deps.db)
  const contadorRepo = new ContadorRepository(deps.db)
  const documentoRepo = new DocumentoRepository(deps.db)
  const aprovacaoRepo = new AprovacaoRepository(deps.db)
  const storage: StoragePort = deps.storage ?? {
    putObject: s3.putObject,
    getPresignedDownloadUrl: s3.getPresignedDownloadUrl,
  }
  const funcionarioService = new FuncionarioService(funcionarioRepo, contadorRepo)
  const documentoService = new DocumentoService(documentoRepo, funcionarioRepo, storage)
  const aprovacaoService = new AprovacaoService(aprovacaoRepo, funcionarioRepo)

  await typed.register(healthRoutes)
  await typed.register(buildFuncionarioRoutes(funcionarioService), { prefix: '/funcionarios' })
  await typed.register(buildDocumentoRoutes(documentoService))
  await typed.register(buildAprovacaoRoutes(aprovacaoService))

  return app
}
