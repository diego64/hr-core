/**
 * Integration test do pipeline Kafka end-to-end:
 *
 *   1. Sobe Kafka real via @testcontainers/kafka
 *   2. Sobe Mongo real via @testcontainers/mongodb
 *   3. Cria producer + consumer reais via kafkajs
 *   4. Publica um FuncionarioCriado simulando o ms-funcionario
 *   5. Verifica que o consumer do folha-pagamento popula funcionarios_cache
 *
 * Pré-requisito: Docker disponível no host.
 *
 * Comando: pnpm --filter @hr-core/folha-pagamento test:integration
 */
import { KafkaContainer, type StartedKafkaContainer } from '@testcontainers/kafka'
import { Kafka, type Consumer, type Producer } from 'kafkajs'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { startMongoHarness, type MongoHarness } from '../../../test/mongo-harness.js'
import { FuncionarioCacheRepository } from '../../modules/repositories/funcionario-cache.repository.js'
import { startConsumers } from './event-consumer.js'
import { TOPICS_CONSUMED } from './topics.js'

/**
 * NOTA — SKIP por padrão: @testcontainers/kafka@12 só suporta
 * `confluentinc/cp-kafka` em KRaft (não a imagem `apache/kafka` oficial).
 * A imagem cp-kafka é pesada (~700MB) e a inicialização excede 5min
 * mesmo com a imagem cached. Roda local mas é inviável em CI.
 *
 * O pipeline é validado E2E contra o stack `infra/docker-compose.kafka.yml`
 * via `docker exec ... kafka-console-consumer` + curl no POST /funcionarios.
 *
 * Para rodar manualmente: troque `describe.skip` por `describe` e use
 * timeout >= 5min.
 */
describe.skip('Kafka pipeline (integration) — produtor + consumer real', () => {
  let mongo: MongoHarness
  let kafka: StartedKafkaContainer
  let kafkajs: Kafka
  let producer: Producer
  let consumer: Consumer
  let funcionarioRepo: FuncionarioCacheRepository

  beforeAll(async () => {
    // 1. Sobe Mongo
    mongo = await startMongoHarness()
    funcionarioRepo = new FuncionarioCacheRepository(mongo.db)

    // 2. Sobe Kafka real (testcontainers spinna confluentinc/cp-kafka).
    // @testcontainers/kafka@12 só suporta CP 7.0+ em KRaft.
    // KAFKA_PORT externo (mapped) = 9093 PLAINTEXT listener da imagem.
    kafka = await new KafkaContainer('confluentinc/cp-kafka:7.5.0').withKraft().start()
    const broker = `${kafka.getHost()}:${kafka.getMappedPort(9093)}`

    kafkajs = new Kafka({
      clientId: 'integration-test',
      brokers: [broker],
    })

    // 3. Producer + Consumer reais
    producer = kafkajs.producer({ allowAutoTopicCreation: true })
    consumer = kafkajs.consumer({
      groupId: `test-group-${Date.now()}`,
      allowAutoTopicCreation: true,
    })
    await producer.connect()
    await consumer.connect()

    // 4. Inicia o consumer com o handler do folha-pagamento
    await startConsumers({
      consumer,
      funcionarioRepo,
      log: {
        info: () => undefined,
        warn: () => undefined,
        error: () => undefined,
        debug: () => undefined,
        fatal: () => undefined,
        trace: () => undefined,
        silent: () => undefined,
        child: () => ({}) as never,
        level: 'silent',
      } as never,
    })
  }, 300_000)

  afterAll(async () => {
    await consumer?.disconnect().catch(() => undefined)
    await producer?.disconnect().catch(() => undefined)
    await kafka?.stop().catch(() => undefined)
    await mongo?.stop().catch(() => undefined)
  }, 60_000)

  beforeEach(async () => {
    await mongo.reset()
  })

  /**
   * Espera condição true por até `timeoutMs` ms — usado para aguardar o
   * consumer processar a mensagem (não é síncrono).
   */
  async function waitFor(
    condition: () => Promise<boolean>,
    timeoutMs = 15_000,
    pollMs = 100,
  ): Promise<void> {
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
      if (await condition()) return
      await new Promise((r) => setTimeout(r, pollMs))
    }
    throw new Error(`waitFor timeout after ${timeoutMs}ms`)
  }

  it('publica FuncionarioCriado e o consumer popula funcionarios_cache', async () => {
    const funcionarioId = '00000000-0000-0000-0000-000000000abc'
    const codigoFun = 'FUN12345678900'

    const envelope = {
      eventType: 'FuncionarioCriado',
      aggregateId: funcionarioId,
      payload: {
        funcionarioId,
        codigoFun,
        nome: 'João Pipeline',
        setor: 'Tecnologia',
        salarioBase: 5_000,
        numeroDependentes: 1,
      },
      source: 'ms-funcionario',
      occurredAt: new Date().toISOString(),
    }

    await producer.send({
      topic: TOPICS_CONSUMED.FUNCIONARIO_CRIADO,
      messages: [{ key: funcionarioId, value: JSON.stringify(envelope) }],
    })

    // Espera o consumer processar
    await waitFor(async () => {
      const cached = await funcionarioRepo.findByCodigoFun(codigoFun)
      return cached !== null
    })

    const cached = await funcionarioRepo.findByCodigoFun(codigoFun)
    expect(cached?.codigoFun).toBe(codigoFun)
    expect(cached?.nome).toBe('João Pipeline')
    expect(cached?.salarioBase).toBe(5_000)
    expect(cached?.numeroDependentes).toBe(1)
    expect(cached?.ativo).toBe(true)
  }, 30_000)

  it('publica FuncionarioDesligado e o consumer marca ativo=false', async () => {
    const funcionarioId = '00000000-0000-0000-0000-000000000abc'
    const codigoFun = 'FUN12345678900'

    // Pré-popula cache (já como ativo=true)
    await funcionarioRepo.upsert({
      funcionarioId,
      codigoFun,
      nome: 'João',
      salarioBase: 5_000,
      numeroDependentes: 0,
      ativo: true,
    })

    const envelope = {
      eventType: 'FuncionarioDesligado',
      aggregateId: funcionarioId,
      payload: { funcionarioId },
      source: 'ms-funcionario',
      occurredAt: new Date().toISOString(),
    }

    await producer.send({
      topic: TOPICS_CONSUMED.FUNCIONARIO_DESLIGADO,
      messages: [{ key: funcionarioId, value: JSON.stringify(envelope) }],
    })

    await waitFor(async () => {
      const cached = await funcionarioRepo.findByFuncionarioId(funcionarioId)
      return cached?.ativo === false
    })

    const cached = await funcionarioRepo.findByFuncionarioId(funcionarioId)
    expect(cached?.ativo).toBe(false)
  }, 30_000)
})
