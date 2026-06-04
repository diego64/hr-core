/**
 * Tópicos Kafka consumidos pelo ms-avaliacao.
 */
export const TOPICS_CONSUMED = {
  FUNCIONARIO_CRIADO: 'hr.funcionario.criado',
  FUNCIONARIO_DESLIGADO: 'hr.funcionario.desligado',
} as const

/**
 * Tópicos Kafka produzidos pelo ms-avaliacao.
 */
export const TOPICS_PRODUCED = {
  AVALIACAO_CRIADA: 'hr.avaliacao.criada',
  AVALIACAO_ATUALIZADA: 'hr.avaliacao.atualizada',
} as const

export const CONSUMER_GROUP = 'avaliacao-consumer-group'
