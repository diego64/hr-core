/**
 * Tópicos Kafka consumidos pelo ms-folha-pagamento.
 *
 * Os tópicos são pré-criados pelo `infra/docker-compose.kafka.yml` (kafka-init).
 * Em produção devem ser criados via scripts de deploy ou Terraform.
 */
export const TOPICS_CONSUMED = {
  FUNCIONARIO_CRIADO: 'hr.funcionario.criado',
  FUNCIONARIO_DESLIGADO: 'hr.funcionario.desligado',
  SALARIO_ALTERADO: 'hr.funcionario.salario-alterado',
  DEPENDENTE_ADICIONADO: 'hr.dependente.adicionado',
  GOZO_CONCLUIDO: 'hr.ferias.gozo-concluido',
} as const

/**
 * Tópicos Kafka produzidos pelo ms-folha-pagamento. Cada transição de
 * folha publica um evento separado.
 */
export const TOPICS_PRODUCED = {
  FOLHA_ABERTA: 'hr.folha.aberta',
  FOLHA_PROCESSADA: 'hr.folha.processada',
  FOLHA_APROVADA: 'hr.folha.aprovada',
  FOLHA_PAGA: 'hr.folha.paga',
  FOLHA_FECHADA: 'hr.folha.fechada',
} as const

export const CONSUMER_GROUP = 'folha-pagamento-consumer-group'
