/**
 * Contrato de publicação de eventos de domínio. Mesmo padrão do ms-ferias:
 * `LogEventPublisher` é stub que loga JSON estruturado até Kafka entrar no
 * projeto. Os services não mudam quando o broker subir.
 *
 * Payload segue o doc da arquitetura ms-avaliacao:
 *   { eventType, aggregateId, occurredAt, payload, source: 'ms-avaliacao' }
 */
import type { FastifyBaseLogger } from 'fastify'

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
