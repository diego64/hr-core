import type {
  DomainEventMessage,
  EventPublisher,
} from '../src/infrastructure/messaging/event-publisher.js'

/**
 * Publisher acumula os eventos publicados em memória. Útil para asserções
 * em testes — substitui o `LogEventPublisher` no DI do buildApp via `events`.
 */
export class InMemoryEventPublisher implements EventPublisher {
  public readonly events: DomainEventMessage[] = []

  async publish(event: Omit<DomainEventMessage, 'source' | 'occurredAt'>): Promise<void> {
    this.events.push({
      ...event,
      occurredAt: new Date().toISOString(),
      source: 'ms-avaliacao',
    })
  }

  reset(): void {
    this.events.length = 0
  }
}
