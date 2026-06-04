/**
 * EventPublisher do ms-funcionario.
 *
 *   - `KafkaEventPublisher`               — Publica no broker Kafka real
 *     (kafkajs). Usado quando KAFKA_ENABLED=true.
 *   - `LogEventPublisher`                 — Fallback. Loga JSON estruturado.
 *   - `InMemoryEventPublisher` (test/)    — Acumula para asserções.
 */
import type { FastifyBaseLogger } from 'fastify'
import type { Producer } from 'kafkajs'

import { TOPICS_PRODUCED } from './topics.js'

export type FuncionarioEventType =
  | 'FuncionarioCriado'
  | 'FuncionarioDesligado'
  | 'SalarioAlterado'
  | 'DependenteAdicionado'

export interface DomainEventMessage {
  readonly eventType: FuncionarioEventType
  readonly aggregateId: string // funcionarioId
  readonly occurredAt: string // ISO 8601
  readonly payload: Record<string, unknown>
  readonly source: 'ms-funcionario'
}

export interface EventPublisher {
  publish(event: Omit<DomainEventMessage, 'source' | 'occurredAt'>): Promise<void>
}

const TOPIC_BY_EVENT: Readonly<Record<FuncionarioEventType, string>> = {
  FuncionarioCriado: TOPICS_PRODUCED.FUNCIONARIO_CRIADO,
  FuncionarioDesligado: TOPICS_PRODUCED.FUNCIONARIO_DESLIGADO,
  SalarioAlterado: TOPICS_PRODUCED.SALARIO_ALTERADO,
  DependenteAdicionado: TOPICS_PRODUCED.DEPENDENTE_ADICIONADO,
} as const

export class LogEventPublisher implements EventPublisher {
  constructor(private readonly log: FastifyBaseLogger) {}

  async publish(event: Omit<DomainEventMessage, 'source' | 'occurredAt'>): Promise<void> {
    const message: DomainEventMessage = {
      ...event,
      occurredAt: new Date().toISOString(),
      source: 'ms-funcionario',
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
    const message: DomainEventMessage = {
      ...event,
      occurredAt: new Date().toISOString(),
      source: 'ms-funcionario',
    }
    await this.producer.send({
      topic,
      messages: [{ key: event.aggregateId, value: JSON.stringify(message) }],
    })
    this.log.info({ eventType: event.eventType, topic, key: event.aggregateId }, 'event.published')
  }
}
