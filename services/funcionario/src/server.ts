import { buildApp } from './app.js'
import { env } from './config/env.js'
import { closeMongo, connectMongo } from './database/mongo.js'
import { closeS3, ensureBucket } from './storage/s3.js'
import { shutdownTracing } from './tracing.js'

async function start(): Promise<void> {
  const db = await connectMongo()
  // Bucket precisa existir antes de qualquer upload de documento. Idempotente
  // (no-op se MinIO/S3 já tem o bucket). Falha-fast no boot se o storage
  // estiver fora — não tem sentido subir o serviço sem ele.
  await ensureBucket()
  const app = await buildApp({ db })

  const shutdown = async (signal: NodeJS.Signals): Promise<void> => {
    app.log.info({ signal }, 'shutdown signal received')
    try {
      await app.close()
      await closeMongo()
      closeS3()
      await shutdownTracing()
      process.exit(0)
    } catch (err) {
      app.log.error({ err }, 'error during shutdown')
      process.exit(1)
    }
  }

  process.on('SIGTERM', (signal) => {
    void shutdown(signal)
  })
  process.on('SIGINT', (signal) => {
    void shutdown(signal)
  })

  try {
    await app.listen({ port: env.PORT, host: env.HOST })
  } catch (err) {
    app.log.fatal({ err }, 'failed to start')
    process.exit(1)
  }
}

start().catch((err: unknown) => {
  process.stderr.write(
    `bootstrap failed: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}\n`,
  )
  process.exit(1)
})
