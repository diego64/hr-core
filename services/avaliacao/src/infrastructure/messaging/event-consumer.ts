/**
 * Consumer Kafka do ms-avaliacao — popula `funcionarios_cache` a partir
 * dos eventos do ms-funcionario.
 */
import type { FastifyBaseLogger } from 'fastify'
import type { Consumer, EachMessagePayload } from 'kafkajs'

import type { FuncionarioCacheRepository } from '../../modules/repositories/funcionario-cache.repository.js'
import { CONSUMER_GROUP, TOPICS_CONSUMED } from './topics.js'

export interface ConsumerDeps {
  readonly consumer: Consumer
  readonly funcionarioRepo: FuncionarioCacheRepository
  readonly log: FastifyBaseLogger
}

interface FuncionarioCriadoPayload {
  readonly funcionarioId: string
  readonly codigoFun: string
  readonly nome: string
  readonly setor?: string | null
}

interface FuncionarioDesligadoPayload {
  readonly funcionarioId: string
}

interface DomainEnvelope {
  readonly eventType: string
  readonly aggregateId: string
  readonly payload: Record<string, unknown>
  readonly source: string
  readonly occurredAt: string
}

export async function startConsumers(deps: ConsumerDeps): Promise<void> {
  const { consumer, funcionarioRepo, log } = deps

  await consumer.subscribe({
    topics: [TOPICS_CONSUMED.FUNCIONARIO_CRIADO, TOPICS_CONSUMED.FUNCIONARIO_DESLIGADO],
    fromBeginning: false,
  })

  await consumer.run({
    eachMessage: async (msg: EachMessagePayload) => {
      const { topic, message, partition } = msg
      const raw = message.value?.toString('utf-8')
      if (!raw) {
        log.warn({ topic, partition, offset: message.offset }, 'message sem value — skip')
        return
      }

      let envelope: DomainEnvelope
      try {
        envelope = JSON.parse(raw) as DomainEnvelope
      } catch (err) {
        log.error({ err, topic, raw }, 'falha ao parsear mensagem')
        return
      }

      try {
        if (topic === TOPICS_CONSUMED.FUNCIONARIO_CRIADO) {
          await handleFuncionarioCriado(envelope, funcionarioRepo, log)
        } else if (topic === TOPICS_CONSUMED.FUNCIONARIO_DESLIGADO) {
          await handleFuncionarioDesligado(envelope, funcionarioRepo, log)
        } else {
          log.warn({ topic }, 'topic recebido sem handler')
        }
      } catch (err) {
        log.error(
          { err, topic, eventType: envelope.eventType, aggregateId: envelope.aggregateId },
          'handler de consumer falhou',
        )
        throw err
      }
    },
  })

  log.info({ group: CONSUMER_GROUP }, 'consumers Kafka iniciados')
}

async function handleFuncionarioCriado(
  envelope: DomainEnvelope,
  repo: FuncionarioCacheRepository,
  log: FastifyBaseLogger,
): Promise<void> {
  const p = envelope.payload as unknown as FuncionarioCriadoPayload
  if (!p.funcionarioId || !p.codigoFun || !p.nome) {
    log.warn({ payload: p }, 'FuncionarioCriado: payload incompleto, skip')
    return
  }
  await repo.upsert({
    _id: p.funcionarioId,
    codigoFun: p.codigoFun,
    nome: p.nome,
    setor: p.setor ?? '',
    ativo: true,
  })
  log.info(
    { codigoFun: p.codigoFun, funcionarioId: p.funcionarioId },
    'funcionario cacheado via FuncionarioCriado',
  )
}

async function handleFuncionarioDesligado(
  envelope: DomainEnvelope,
  repo: FuncionarioCacheRepository,
  log: FastifyBaseLogger,
): Promise<void> {
  const p = envelope.payload as unknown as FuncionarioDesligadoPayload
  if (!p.funcionarioId) {
    log.warn({ payload: p }, 'FuncionarioDesligado: payload incompleto, skip')
    return
  }
  await repo.marcarInativo(p.funcionarioId)
  log.info(
    { funcionarioId: p.funcionarioId },
    'funcionario marcado inativo via FuncionarioDesligado',
  )
}
