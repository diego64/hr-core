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

/**
 * Stub que loga eventos como JSON estruturado. Quando Kafka subir, troca-se
 * a implementação no app.ts sem mexer em nenhum service.
 */
export class LogEventPublisher implements EventPublisher {
  constructor(private readonly log: FastifyBaseLogger) {}

  async publish(event: Omit<DomainEventMessage, 'source' | 'occurredAt'>): Promise<void> {
    const message: DomainEventMessage = {
      ...event,
      occurredAt: new Date().toISOString(),
      source: 'ms-ferias',
    }
    // Nível info — visível no Loki/Tempo via correlação com traceId do request.
    this.log.info({ event: message }, `event.published ${message.eventType}`)
  }
}
