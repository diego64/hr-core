/**
 * Contrato de publicação de eventos de domínio. Mesmo padrão do ms-ferias:
 * `LogEventPublisher` é stub que loga JSON estruturado até Kafka entrar no
 * projeto. Os services não mudam quando o broker subir.
 *
 * Payload segue o doc da arquitetura ms-avaliacao:
 *   { eventType, aggregateId, occurredAt, payload, source: 'ms-avaliacao' }
 */
import type { FastifyBaseLogger } from 'fastify'
import type { Producer } from 'kafkajs'

import { TOPICS_PRODUCED } from './topics.js'

export type AvaliacaoEventType =
  | 'AvaliacaoCriada'
  | 'AvaliacaoAtualizada'
  | 'AvaliadorCriado'
  | 'AvaliadorDesativado'

export interface DomainEventMessage {
  readonly eventType: AvaliacaoEventType
  readonly aggregateId: string
  readonly occurredAt: string
  readonly payload: Record<string, unknown>
  readonly source: 'ms-avaliacao'
}

export interface EventPublisher {
  publish(event: Omit<DomainEventMessage, 'source' | 'occurredAt'>): Promise<void>
}

const TOPIC_BY_EVENT: Readonly<Record<AvaliacaoEventType, string | undefined>> = {
  AvaliacaoCriada: TOPICS_PRODUCED.AVALIACAO_CRIADA,
  AvaliacaoAtualizada: TOPICS_PRODUCED.AVALIACAO_ATUALIZADA,
  // AvaliadorCriado/Desativado não publicados em Kafka — apenas internos
  // (não consumidos por outros services). Mantidos no enum.
  AvaliadorCriado: undefined,
  AvaliadorDesativado: undefined,
} as const

export class LogEventPublisher implements EventPublisher {
  constructor(private readonly log: FastifyBaseLogger) {}

  async publish(event: Omit<DomainEventMessage, 'source' | 'occurredAt'>): Promise<void> {
    const message: DomainEventMessage = {
      ...event,
      occurredAt: new Date().toISOString(),
      source: 'ms-avaliacao',
    }
    this.log.info({ event: message }, `event.published ${message.eventType}`)
  }
}

export class KafkaEventPublisher implements EventPublisher {
  constructor(
    private readonly producer: Producer,
    private readonly log: FastifyBaseLogger,
  ) {}

  async publish(event: Omit<DomainEventMessage, 'source' | 'occurredAt'>): Promise<void> {
    const topic = TOPIC_BY_EVENT[event.eventType]
    if (!topic) {
      this.log.debug({ eventType: event.eventType }, 'event sem tópico — skip')
      return
    }
    const message: DomainEventMessage = {
      ...event,
      occurredAt: new Date().toISOString(),
      source: 'ms-avaliacao',
    }
    await this.producer.send({
      topic,
      messages: [{ key: event.aggregateId, value: JSON.stringify(message) }],
    })
    this.log.info({ eventType: event.eventType, topic, key: event.aggregateId }, 'event.published')
  }
}
