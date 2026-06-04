/**
 * Consumer Kafka do ms-ferias. Ferias não tem `funcionarios_cache` (o domínio
 * trabalha com `periodos_aquisitivos`), então o handler de FuncionarioCriado
 * é uma extensão futura — disparará `PeriodoAquisitivoService.iniciar()`.
 *
 * Por enquanto, apenas LOGA os eventos recebidos para validar que o pipeline
 * está vivo. Tickets futuros vão substituir o handler por um chamado real
 * ao service.
 */
import type { FastifyBaseLogger } from 'fastify'
import type { Consumer, EachMessagePayload } from 'kafkajs'

import { CONSUMER_GROUP, TOPICS_CONSUMED } from './topics.js'

export interface ConsumerDeps {
  readonly consumer: Consumer
  readonly log: FastifyBaseLogger
}

interface DomainEnvelope {
  readonly eventType: string
  readonly aggregateId: string
  readonly payload: Record<string, unknown>
  readonly source: string
  readonly occurredAt: string
}

export async function startConsumers(deps: ConsumerDeps): Promise<void> {
  const { consumer, log } = deps

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

      // TODO: ao receber FuncionarioCriado, chamar
      // PeriodoAquisitivoService.iniciar(funcionarioId, cpf, dataAdmissao)
      // que cria o primeiro período aquisitivo. Por enquanto só LOGA.
      log.info(
        { topic, eventType: envelope.eventType, aggregateId: envelope.aggregateId },
        'kafka event recebido (handler pendente)',
      )
    },
  })

  log.info({ group: CONSUMER_GROUP }, 'consumers Kafka iniciados')
}
