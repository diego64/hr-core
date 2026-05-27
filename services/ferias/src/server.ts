import { buildApp } from './app.js'
import { env } from './config/env.js'
import { closeMongo, connectMongo } from './database/mongo.js'
import { startScheduler } from './jobs/scheduler.js'
import { shutdownTracing } from './tracing.js'

async function start(): Promise<void> {
  const db = await connectMongo()
  const app = await buildApp({ db })

  const scheduler = startScheduler({
    db,
    aquisitivoRepo: app.ctx.periodoAquisitivoRepo,
    gozoService: app.ctx.periodoGozoService,
    events: app.ctx.events,
    log: app.log,
  })

  const shutdown = async (signal: NodeJS.Signals): Promise<void> => {
    app.log.info({ signal }, 'shutdown signal received')
    try {
      scheduler.stop()
      await app.close()
      await closeMongo()
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
