/**
 * Tópicos Kafka consumidos pelo ms-ferias.
 */
export const TOPICS_CONSUMED = {
  FUNCIONARIO_CRIADO: 'hr.funcionario.criado',
  FUNCIONARIO_DESLIGADO: 'hr.funcionario.desligado',
} as const

/**
 * Tópicos Kafka produzidos pelo ms-ferias.
 */
export const TOPICS_PRODUCED = {
  FERIAS_SOLICITADAS: 'hr.ferias.solicitadas',
  FERIAS_APROVADAS: 'hr.ferias.aprovadas',
  FERIAS_REJEITADAS: 'hr.ferias.rejeitadas',
  FERIAS_CANCELADAS: 'hr.ferias.canceladas',
  GOZO_CONCLUIDO: 'hr.ferias.gozo-concluido',
} as const

export const CONSUMER_GROUP = 'ferias-consumer-group'
