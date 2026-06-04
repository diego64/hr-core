/**
 * Unit tests do EventPublisher do ms-ferias.
 */
import { describe, expect, it, vi } from 'vitest'
import type { FastifyBaseLogger } from 'fastify'
import type { Producer } from 'kafkajs'

import {
  KafkaEventPublisher,
  LogEventPublisher,
  type DomainEventMessage,
} from './event-publisher.js'
import { TOPICS_PRODUCED } from './topics.js'

function makeLogger(): FastifyBaseLogger {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    fatal: vi.fn(),
    trace: vi.fn(),
    level: 'info',
    silent: vi.fn(),
    child: vi.fn(() => makeLogger()),
  }
}

describe('LogEventPublisher', () => {
  it('publish enriquece com source + occurredAt', async () => {
    const log = makeLogger()
    const pub = new LogEventPublisher(log)

    await pub.publish({
      eventType: 'FeriasSolicitadas',
      aggregateId: 'fid-1',
      payload: { codigo: 'FER000001' },
    })

    expect(log.info).toHaveBeenCalledTimes(1)
    const [event] = (log.info as ReturnType<typeof vi.fn>).mock.calls[0]!
    const enriched = event.event as DomainEventMessage
    expect(enriched.source).toBe('ms-ferias')
  })
})

describe('KafkaEventPublisher', () => {
  it('publish envia para o tópico correto', async () => {
    const send = vi.fn().mockResolvedValue([])
    const producer = { send } as unknown as Producer
    const pub = new KafkaEventPublisher(producer, makeLogger())

    await pub.publish({
      eventType: 'FeriasSolicitadas',
      aggregateId: 'fid-1',
      payload: { codigo: 'FER000001' },
    })

    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({ topic: TOPICS_PRODUCED.FERIAS_SOLICITADAS }),
    )
  })

  it('GozoIniciado não tem tópico — não publica', async () => {
    const send = vi.fn()
    const producer = { send } as unknown as Producer
    const pub = new KafkaEventPublisher(producer, makeLogger())

    await pub.publish({ eventType: 'GozoIniciado', aggregateId: 'fid-1', payload: {} })

    expect(send).not.toHaveBeenCalled()
  })

  it.each([
    ['FeriasSolicitadas', TOPICS_PRODUCED.FERIAS_SOLICITADAS],
    ['FeriasAprovadas', TOPICS_PRODUCED.FERIAS_APROVADAS],
    ['FeriasRejeitadas', TOPICS_PRODUCED.FERIAS_REJEITADAS],
    ['FeriasCanceladas', TOPICS_PRODUCED.FERIAS_CANCELADAS],
    ['GozoConcluido', TOPICS_PRODUCED.GOZO_CONCLUIDO],
  ])('mapeia %s para o tópico %s', async (eventType, expectedTopic) => {
    const send = vi.fn().mockResolvedValue([])
    const producer = { send } as unknown as Producer
    const pub = new KafkaEventPublisher(producer, makeLogger())

    await pub.publish({
      eventType: eventType as 'FeriasSolicitadas',
      aggregateId: 'fid-1',
      payload: {},
    })

    expect(send).toHaveBeenCalledWith(expect.objectContaining({ topic: expectedTopic }))
  })
})
