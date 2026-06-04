/**
 * Unit tests do EventPublisher do ms-funcionario.
 * - LogEventPublisher: verifica que log.info é chamado com payload enriquecido
 * - KafkaEventPublisher: verifica que send é chamado com topic+key+value
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
  it('publish enriquece com source + occurredAt e chama log.info', async () => {
    const log = makeLogger()
    const pub = new LogEventPublisher(log)

    await pub.publish({
      eventType: 'FuncionarioCriado',
      aggregateId: 'fid-1',
      payload: { codigoFun: 'FUN12345678900' },
    })

    expect(log.info).toHaveBeenCalledTimes(1)
    const [event, msg] = (log.info as ReturnType<typeof vi.fn>).mock.calls[0]!
    expect(msg).toBe('event.published FuncionarioCriado')
    const enriched = event.event as DomainEventMessage
    expect(enriched.source).toBe('ms-funcionario')
    expect(enriched.eventType).toBe('FuncionarioCriado')
    expect(enriched.aggregateId).toBe('fid-1')
    expect(enriched.occurredAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })
})

describe('KafkaEventPublisher', () => {
  it('publish envia para o tópico correto com key=aggregateId e value JSON', async () => {
    const send = vi.fn().mockResolvedValue([])
    const producer = { send } as unknown as Producer
    const pub = new KafkaEventPublisher(producer, makeLogger())

    await pub.publish({
      eventType: 'FuncionarioCriado',
      aggregateId: 'fid-1',
      payload: { codigoFun: 'FUN12345678900', nome: 'João' },
    })

    expect(send).toHaveBeenCalledTimes(1)
    const call = (send as ReturnType<typeof vi.fn>).mock.calls[0]![0]
    expect(call.topic).toBe(TOPICS_PRODUCED.FUNCIONARIO_CRIADO)
    expect(call.messages).toHaveLength(1)
    expect(call.messages[0].key).toBe('fid-1')
    const body = JSON.parse(call.messages[0].value as string)
    expect(body.source).toBe('ms-funcionario')
    expect(body.eventType).toBe('FuncionarioCriado')
    expect(body.payload.nome).toBe('João')
    expect(body.occurredAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  it.each([
    ['FuncionarioCriado', TOPICS_PRODUCED.FUNCIONARIO_CRIADO],
    ['FuncionarioDesligado', TOPICS_PRODUCED.FUNCIONARIO_DESLIGADO],
    ['SalarioAlterado', TOPICS_PRODUCED.SALARIO_ALTERADO],
    ['DependenteAdicionado', TOPICS_PRODUCED.DEPENDENTE_ADICIONADO],
  ])('mapeia %s para o tópico %s', async (eventType, expectedTopic) => {
    const send = vi.fn().mockResolvedValue([])
    const producer = { send } as unknown as Producer
    const pub = new KafkaEventPublisher(producer, makeLogger())

    await pub.publish({
      eventType: eventType as 'FuncionarioCriado',
      aggregateId: 'fid-1',
      payload: {},
    })

    expect(send).toHaveBeenCalledWith(expect.objectContaining({ topic: expectedTopic }))
  })
})
