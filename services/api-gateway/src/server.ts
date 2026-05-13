import { buildApp } from './app.js'
import { env } from './config/env.js'
import { shutdownTracing } from './tracing.js'

async function start(): Promise<void> {
  const app = await buildApp()

  const shutdown = async (signal: NodeJS.Signals): Promise<void> => {
    app.log.info({ signal }, 'shutdown signal received')
    try {
      await app.close()
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
