import type {
  DomainEventMessage,
  EventPublisher,
} from '../src/infrastructure/messaging/event-publisher.js'

/**
 * Acumula eventos publicados em memória para inspeção em testes. Aplica o
 * mesmo enriquecimento (`source`, `occurredAt`) que o `LogEventPublisher`
 * faz, então as asserções batem com o payload real que vai pro broker.
 */
export class InMemoryEventPublisher implements EventPublisher {
  readonly events: DomainEventMessage[] = []

  async publish(event: Omit<DomainEventMessage, 'source' | 'occurredAt'>): Promise<void> {
    this.events.push({
      ...event,
      occurredAt: new Date().toISOString(),
      source: 'ms-folha-pagamento',
    })
  }

  byType(eventType: DomainEventMessage['eventType']): DomainEventMessage[] {
    return this.events.filter((e) => e.eventType === eventType)
  }

  reset(): void {
    this.events.length = 0
  }
}
