/**
 * Contrato de publicação de eventos de domínio. Implementações:
 *
 *   - `KafkaEventPublisher`               — Publica no broker Kafka real
 *     (kafkajs). Usado quando KAFKA_ENABLED=true.
 *   - `LogEventPublisher`                 — Fallback que só loga JSON
 *     estruturado. Usado quando KAFKA_ENABLED=false (dev sem Kafka).
 *   - `InMemoryEventPublisher` (test/)    — Acumula eventos para asserções.
 *
 * Payload segue o doc da arquitetura ms-folha-pagamento:
 *   { eventType, aggregateId, occurredAt, payload, source: 'ms-folha-pagamento' }
 *
 * O eventType decide o tópico via mapa em TOPICS_PRODUCED + helper local.
 */
import type { FastifyBaseLogger } from 'fastify'
import type { Producer } from 'kafkajs'

import { TOPICS_PRODUCED } from './topics.js'

export type FolhaEventType =
  | 'FolhaAberta'
  | 'FolhaProcessada'
  | 'FolhaAprovada'
  | 'FolhaRejeitada'
  | 'FolhaPaga'
  | 'FolhaFechada'

export interface DomainEventMessage {
  readonly eventType: FolhaEventType
  readonly aggregateId: string // funcionarioId
  readonly occurredAt: string // ISO 8601
  readonly payload: Record<string, unknown>
  readonly source: 'ms-folha-pagamento'
}

export interface EventPublisher {
  publish(event: Omit<DomainEventMessage, 'source' | 'occurredAt'>): Promise<void>
}

const TOPIC_BY_EVENT: Readonly<Record<FolhaEventType, string | undefined>> = {
  FolhaAberta: TOPICS_PRODUCED.FOLHA_ABERTA,
  FolhaProcessada: TOPICS_PRODUCED.FOLHA_PROCESSADA,
  FolhaAprovada: TOPICS_PRODUCED.FOLHA_APROVADA,
  // FolhaRejeitada não publica em Kafka — só audita interno (não consumido
  // por outros services). Mantemos no enum por completude.
  FolhaRejeitada: undefined,
  FolhaPaga: TOPICS_PRODUCED.FOLHA_PAGA,
  FolhaFechada: TOPICS_PRODUCED.FOLHA_FECHADA,
} as const

/**
 * Stub usado quando KAFKA_ENABLED=false. Loga JSON estruturado.
 */
export class LogEventPublisher implements EventPublisher {
  constructor(private readonly log: FastifyBaseLogger) {}

  async publish(event: Omit<DomainEventMessage, 'source' | 'occurredAt'>): Promise<void> {
    const message: DomainEventMessage = {
      ...event,
      occurredAt: new Date().toISOString(),
      source: 'ms-folha-pagamento',
    }
    this.log.info({ event: message }, `event.published ${message.eventType}`)
  }
}

/**
 * Publica eventos no broker Kafka real via kafkajs.
 *
 * - Key = aggregateId (funcionarioId): garante ordem por funcionário e
 *   distribui carga entre as 3 partições padrão.
 * - Value = JSON do DomainEventMessage completo.
 * - Falha silenciosa NÃO acontece — kafkajs joga; o caller decide compensar
 *   (ex: gravar em outbox). Para MVP, o erro propaga e quebra a request.
 */
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
      source: 'ms-folha-pagamento',
    }
    await this.producer.send({
      topic,
      messages: [{ key: event.aggregateId, value: JSON.stringify(message) }],
    })
    this.log.info({ eventType: event.eventType, topic, key: event.aggregateId }, 'event.published')
  }
}
