import { buildApp } from './app.js'
import { env } from './config/env.js'
import { closeMongo, connectMongo } from './database/mongo.js'
import { startConsumers } from './infrastructure/messaging/event-consumer.js'
import {
  connectKafka,
  createConsumer,
  disconnectKafka,
  isKafkaEnabled,
} from './infrastructure/messaging/kafka-client.js'
import { KafkaEventPublisher } from './infrastructure/messaging/event-publisher.js'
import { CONSUMER_GROUP } from './infrastructure/messaging/topics.js'
import { shutdownTracing } from './tracing.js'

async function start(): Promise<void> {
  const db = await connectMongo()

  // Setup Kafka opcional (KAFKA_ENABLED=false → LogEventPublisher + sem consumers).
  let kafkaEvents: KafkaEventPublisher | undefined
  if (isKafkaEnabled()) {
    const { producer } = await connectKafka()
    // log será sobrescrito após buildApp() — vamos passar um proxy mais
    // tarde. Por enquanto, log do node temporário até buildApp expor app.log.
    kafkaEvents = new KafkaEventPublisher(producer, console as never)
  }

  const app = await buildApp(kafkaEvents ? { db, events: kafkaEvents } : { db })

  // Re-bind do logger pino do Fastify no publisher Kafka pra ganhar traceId
  if (kafkaEvents) {
    Object.assign(kafkaEvents, { log: app.log })
  }

  // Inicia consumers Kafka — só se KAFKA_ENABLED=true
  if (isKafkaEnabled()) {
    const consumer = createConsumer(CONSUMER_GROUP)
    await consumer.connect()
    await startConsumers({
      consumer,
      funcionarioRepo: app.ctx.funcionarioRepo,
      log: app.log,
    })
  }

  const shutdown = async (signal: NodeJS.Signals): Promise<void> => {
    app.log.info({ signal }, 'shutdown signal received')
    try {
      await app.close()
      await disconnectKafka()
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
