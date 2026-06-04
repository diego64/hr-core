/**
 * Unit tests do handler de consumer Kafka do folha-pagamento.
 *
 * Não testa o `consumer.run({ eachMessage })` em si (isso é coberto pelo
 * integration test com @testcontainers/kafka). Aqui validamos só a lógica
 * de despacho por tópico + handlers individuais via mocks.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Consumer, EachMessagePayload } from 'kafkajs'

import { FakeFuncionarioCacheRepository } from '../../../test/fakes.js'
import type { FuncionarioCacheRepository } from '../../modules/repositories/funcionario-cache.repository.js'
import { startConsumers } from './event-consumer.js'
import { TOPICS_CONSUMED } from './topics.js'

function makeLogger() {
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
  } as never
}

function makeEnvelope(eventType: string, payload: Record<string, unknown>) {
  return JSON.stringify({
    eventType,
    aggregateId: 'fid-1',
    payload,
    source: 'ms-funcionario',
    occurredAt: new Date().toISOString(),
  })
}

function makeMessagePayload(topic: string, value: string | undefined): EachMessagePayload {
  return {
    topic,
    partition: 0,
    message: {
      key: null,
      value: value === undefined ? null : Buffer.from(value, 'utf-8'),
      timestamp: '0',
      attributes: 0,
      offset: '0',
      size: value?.length ?? 0,
      headers: {},
    },
    heartbeat: async () => undefined,
    pause: () => () => undefined,
  } as unknown as EachMessagePayload
}

describe('event-consumer (folha-pagamento)', () => {
  let funcionarioRepo: FakeFuncionarioCacheRepository
  let consumer: Consumer
  let subscribe: ReturnType<typeof vi.fn>
  let eachMessageHandler: ((m: EachMessagePayload) => Promise<void>) | undefined

  beforeEach(() => {
    funcionarioRepo = new FakeFuncionarioCacheRepository()
    eachMessageHandler = undefined
    subscribe = vi.fn().mockResolvedValue(undefined)
    consumer = {
      subscribe,
      run: vi.fn().mockImplementation(async (opts: { eachMessage: typeof eachMessageHandler }) => {
        eachMessageHandler = opts.eachMessage
      }),
    } as unknown as Consumer
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  async function setup() {
    await startConsumers({
      consumer,
      funcionarioRepo: funcionarioRepo as unknown as FuncionarioCacheRepository,
      log: makeLogger(),
    })
    if (!eachMessageHandler) throw new Error('eachMessage handler não foi registrado')
    return eachMessageHandler
  }

  it('subscribe inclui os dois tópicos esperados', async () => {
    await setup()
    expect(subscribe).toHaveBeenCalledWith({
      topics: [TOPICS_CONSUMED.FUNCIONARIO_CRIADO, TOPICS_CONSUMED.FUNCIONARIO_DESLIGADO],
      fromBeginning: false,
    })
  })

  it('FuncionarioCriado: payload válido → upsert no cache', async () => {
    const handler = await setup()
    const payload = {
      funcionarioId: 'fid-1',
      codigoFun: 'FUN12345678900',
      nome: 'João',
      setor: 'Tecnologia',
      salarioBase: 5000,
      numeroDependentes: 1,
    }
    await handler(
      makeMessagePayload(
        TOPICS_CONSUMED.FUNCIONARIO_CRIADO,
        makeEnvelope('FuncionarioCriado', payload),
      ),
    )

    const cached = await funcionarioRepo.findByCodigoFun('FUN12345678900')
    expect(cached?.codigoFun).toBe('FUN12345678900')
    expect(cached?.salarioBase).toBe(5000)
    expect(cached?.ativo).toBe(true)
  })

  it('FuncionarioCriado: payload incompleto → skip (não upserta)', async () => {
    const handler = await setup()
    await handler(
      makeMessagePayload(
        TOPICS_CONSUMED.FUNCIONARIO_CRIADO,
        makeEnvelope('FuncionarioCriado', { funcionarioId: 'fid-1' }),
      ),
    )

    expect(funcionarioRepo.items.size).toBe(0)
  })

  it('FuncionarioDesligado: marca ativo=false no cache', async () => {
    const handler = await setup()
    // Primeiro popula o cache
    await funcionarioRepo.upsert({
      funcionarioId: 'fid-1',
      codigoFun: 'FUN12345678900',
      nome: 'João',
      salarioBase: 5000,
      numeroDependentes: 0,
      ativo: true,
    })

    await handler(
      makeMessagePayload(
        TOPICS_CONSUMED.FUNCIONARIO_DESLIGADO,
        makeEnvelope('FuncionarioDesligado', { funcionarioId: 'fid-1' }),
      ),
    )

    const cached = await funcionarioRepo.findByCodigoFun('FUN12345678900')
    expect(cached?.ativo).toBe(false)
  })

  it('mensagem sem value → skip silencioso', async () => {
    const handler = await setup()
    await handler(makeMessagePayload(TOPICS_CONSUMED.FUNCIONARIO_CRIADO, undefined))
    expect(funcionarioRepo.items.size).toBe(0)
  })

  it('mensagem com value não-JSON → skip silencioso (log.error)', async () => {
    const handler = await setup()
    await handler(makeMessagePayload(TOPICS_CONSUMED.FUNCIONARIO_CRIADO, 'não é json {{'))
    expect(funcionarioRepo.items.size).toBe(0)
  })

  it('tópico desconhecido → warn sem efeito', async () => {
    const handler = await setup()
    await handler(makeMessagePayload('hr.topico.desconhecido', makeEnvelope('Foo', {})))
    expect(funcionarioRepo.items.size).toBe(0)
  })
})
