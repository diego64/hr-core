import type { Cpf } from './cpf.js'

/**
 * Código legível do funcionário, derivado deterministicamente do CPF.
 *
 * Por que isso elimina conflito entre serviços: qualquer microserviço que
 * conheça o CPF deriva exatamente o mesmo `FUN12345678900` sem precisar de
 * banco ou coordenação via Kafka. Garante identificação cross-service.
 */
export function gerarCodigoFuncionario(cpf: Cpf): string {
  return `FUN${cpf.value}`
}
