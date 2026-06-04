/**
 * Singleton do cliente Kafka — abstração fina sobre kafkajs.
 *
 * Configuração:
 *   - KAFKA_ENABLED=false → cliente é no-op, service segue sem Kafka
 *     (LogEventPublisher cobre o publish).
 *   - KAFKA_ENABLED=true → conecta via KAFKA_BROKERS e expõe o producer.
 *
 * Lifecycle: `connectKafka()` no bootstrap; `disconnectKafka()` no shutdown.
 * Funcionario é producer-only — não cria consumers.
 */
import { Kafka, type Producer, logLevel } from 'kafkajs'

import { env } from '../../config/env.js'

const CLIENT_ID = 'ms-funcionario'

let kafka: Kafka | null = null
let producer: Producer | null = null

export function isKafkaEnabled(): boolean {
  return env.KAFKA_ENABLED
}

export async function connectKafka(): Promise<{ producer: Producer; kafka: Kafka }> {
  if (!env.KAFKA_ENABLED) {
    throw new Error('Kafka is disabled (KAFKA_ENABLED=false)')
  }
  if (producer && kafka) return { producer, kafka }

  kafka = new Kafka({
    clientId: CLIENT_ID,
    brokers: env.KAFKA_BROKERS.split(',').map((b) => b.trim()),
    logLevel: env.NODE_ENV === 'test' ? logLevel.NOTHING : logLevel.WARN,
    retry: { retries: 5, initialRetryTime: 300 },
  })

  producer = kafka.producer({ allowAutoTopicCreation: false })
  await producer.connect()

  return { producer, kafka }
}

export async function disconnectKafka(): Promise<void> {
  if (producer) {
    await producer.disconnect()
    producer = null
  }
  kafka = null
}
