/**
 * Contrato de publicação de eventos de domínio. Implementações:
 *
 *   - `LogEventPublisher` (este arquivo)  — STUB usado hoje. Loga JSON estruturado
 *     e nada mais. Próximo passo: substituir por `KafkaEventPublisher` (via
 *     kafkajs) quando o broker entrar no projeto. Os call sites em service.ts
 *     NÃO PRECISAM MUDAR — o contrato se mantém.
 *
 *   - `KafkaEventPublisher` (futuro)      — Publish real via kafkajs, com
 *     retry+DLQ.
 *
 *   - `InMemoryEventPublisher` (test/)    — Acumula eventos para asserções de teste.
 *
 * Payload obrigatório segue o doc da arquitetura ms-ferias:
 *   { eventType, aggregateId, occurredAt, payload, source: 'ms-ferias' }
 */
import type { FastifyBaseLogger } from 'fastify'
import type { Producer } from 'kafkajs'

import { TOPICS_PRODUCED } from './topics.js'

export type FeriasEventType =
  | 'FeriasSolicitadas'
  | 'FeriasAprovadas'
  | 'FeriasRejeitadas'
  | 'FeriasCanceladas'
  | 'GozoIniciado'
  | 'GozoConcluido'
  | 'PeriodoVencendo'
  | 'PeriodoVencido'
  | 'NovoPeriodoAquisitivo'

export interface DomainEventMessage {
  readonly eventType: FeriasEventType
  readonly aggregateId: string // funcionarioId
  readonly occurredAt: string // ISO 8601
  readonly payload: Record<string, unknown>
  readonly source: 'ms-ferias'
}

export interface EventPublisher {
  publish(event: Omit<DomainEventMessage, 'source' | 'occurredAt'>): Promise<void>
}

const TOPIC_BY_EVENT: Readonly<Record<FeriasEventType, string | undefined>> = {
  FeriasSolicitadas: TOPICS_PRODUCED.FERIAS_SOLICITADAS,
  FeriasAprovadas: TOPICS_PRODUCED.FERIAS_APROVADAS,
  FeriasRejeitadas: TOPICS_PRODUCED.FERIAS_REJEITADAS,
  FeriasCanceladas: TOPICS_PRODUCED.FERIAS_CANCELADAS,
  GozoConcluido: TOPICS_PRODUCED.GOZO_CONCLUIDO,
  // Eventos internos (jobs) sem consumers cross-service por enquanto.
  GozoIniciado: undefined,
  PeriodoVencendo: undefined,
  PeriodoVencido: undefined,
  NovoPeriodoAquisitivo: undefined,
} as const

export class LogEventPublisher implements EventPublisher {
  constructor(private readonly log: FastifyBaseLogger) {}

  async publish(event: Omit<DomainEventMessage, 'source' | 'occurredAt'>): Promise<void> {
    const message: DomainEventMessage = {
      ...event,
      occurredAt: new Date().toISOString(),
      source: 'ms-ferias',
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
      source: 'ms-ferias',
    }
    await this.producer.send({
      topic,
      messages: [{ key: event.aggregateId, value: JSON.stringify(message) }],
    })
    this.log.info({ eventType: event.eventType, topic, key: event.aggregateId }, 'event.published')
  }
}
