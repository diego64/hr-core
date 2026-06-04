/**
 * Unit tests do EventPublisher do ms-folha-pagamento.
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
      eventType: 'FolhaAberta',
      aggregateId: 'fid-1',
      payload: { codigo: 'FOLHA000001' },
    })

    expect(log.info).toHaveBeenCalledTimes(1)
    const [event] = (log.info as ReturnType<typeof vi.fn>).mock.calls[0]!
    const enriched = event.event as DomainEventMessage
    expect(enriched.source).toBe('ms-folha-pagamento')
    expect(enriched.eventType).toBe('FolhaAberta')
  })
})

describe('KafkaEventPublisher', () => {
  it('publish envia para o tópico correto com key=aggregateId', async () => {
    const send = vi.fn().mockResolvedValue([])
    const producer = { send } as unknown as Producer
    const pub = new KafkaEventPublisher(producer, makeLogger())

    await pub.publish({
      eventType: 'FolhaAberta',
      aggregateId: 'fid-1',
      payload: { codigo: 'FOLHA000001' },
    })

    expect(send).toHaveBeenCalledTimes(1)
    const call = (send as ReturnType<typeof vi.fn>).mock.calls[0]![0]
    expect(call.topic).toBe(TOPICS_PRODUCED.FOLHA_ABERTA)
    expect(call.messages[0].key).toBe('fid-1')
    const body = JSON.parse(call.messages[0].value as string)
    expect(body.source).toBe('ms-folha-pagamento')
  })

  it('FolhaRejeitada não tem tópico — não publica e apenas loga debug', async () => {
    const send = vi.fn()
    const producer = { send } as unknown as Producer
    const log = makeLogger()
    const pub = new KafkaEventPublisher(producer, log)

    await pub.publish({
      eventType: 'FolhaRejeitada',
      aggregateId: 'fid-1',
      payload: { justificativa: 'falta verba' },
    })

    expect(send).not.toHaveBeenCalled()
    expect(log.debug).toHaveBeenCalled()
  })

  it.each([
    ['FolhaAberta', TOPICS_PRODUCED.FOLHA_ABERTA],
    ['FolhaProcessada', TOPICS_PRODUCED.FOLHA_PROCESSADA],
    ['FolhaAprovada', TOPICS_PRODUCED.FOLHA_APROVADA],
    ['FolhaPaga', TOPICS_PRODUCED.FOLHA_PAGA],
    ['FolhaFechada', TOPICS_PRODUCED.FOLHA_FECHADA],
  ])('mapeia %s para o tópico %s', async (eventType, expectedTopic) => {
    const send = vi.fn().mockResolvedValue([])
    const producer = { send } as unknown as Producer
    const pub = new KafkaEventPublisher(producer, makeLogger())

    await pub.publish({
      eventType: eventType as 'FolhaAberta',
      aggregateId: 'fid-1',
      payload: {},
    })

    expect(send).toHaveBeenCalledWith(expect.objectContaining({ topic: expectedTopic }))
  })
})
