/**
 * Unit tests do EventPublisher do ms-avaliacao.
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
      eventType: 'AvaliacaoCriada',
      aggregateId: 'fid-1',
      payload: { codigo: 'AVAL000001' },
    })

    expect(log.info).toHaveBeenCalledTimes(1)
    const [event] = (log.info as ReturnType<typeof vi.fn>).mock.calls[0]!
    const enriched = event.event as DomainEventMessage
    expect(enriched.source).toBe('ms-avaliacao')
  })
})

describe('KafkaEventPublisher', () => {
  it('publish envia para o tópico correto', async () => {
    const send = vi.fn().mockResolvedValue([])
    const producer = { send } as unknown as Producer
    const pub = new KafkaEventPublisher(producer, makeLogger())

    await pub.publish({
      eventType: 'AvaliacaoCriada',
      aggregateId: 'fid-1',
      payload: { codigo: 'AVAL000001' },
    })

    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({ topic: TOPICS_PRODUCED.AVALIACAO_CRIADA }),
    )
  })

  it('AvaliadorCriado não tem tópico — não publica', async () => {
    const send = vi.fn()
    const producer = { send } as unknown as Producer
    const pub = new KafkaEventPublisher(producer, makeLogger())

    await pub.publish({ eventType: 'AvaliadorCriado', aggregateId: 'a-1', payload: {} })

    expect(send).not.toHaveBeenCalled()
  })

  it.each([
    ['AvaliacaoCriada', TOPICS_PRODUCED.AVALIACAO_CRIADA],
    ['AvaliacaoAtualizada', TOPICS_PRODUCED.AVALIACAO_ATUALIZADA],
  ])('mapeia %s para o tópico %s', async (eventType, expectedTopic) => {
    const send = vi.fn().mockResolvedValue([])
    const producer = { send } as unknown as Producer
    const pub = new KafkaEventPublisher(producer, makeLogger())

    await pub.publish({
      eventType: eventType as 'AvaliacaoCriada',
      aggregateId: 'fid-1',
      payload: {},
    })

    expect(send).toHaveBeenCalledWith(expect.objectContaining({ topic: expectedTopic }))
  })
})
