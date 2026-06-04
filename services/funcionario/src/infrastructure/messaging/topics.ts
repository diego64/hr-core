/**
 * Tópicos Kafka produzidos pelo ms-funcionario. Consumidos por
 * folha-pagamento, ferias e avaliacao para popular caches locais.
 */
export const TOPICS_PRODUCED = {
  FUNCIONARIO_CRIADO: 'hr.funcionario.criado',
  FUNCIONARIO_DESLIGADO: 'hr.funcionario.desligado',
  SALARIO_ALTERADO: 'hr.funcionario.salario-alterado',
  DEPENDENTE_ADICIONADO: 'hr.dependente.adicionado',
} as const
