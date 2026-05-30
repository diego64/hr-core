/**
 * Código legível do funcionário, derivado deterministicamente do CPF.
 *
 * Por que isso elimina conflito entre serviços: qualquer microserviço que
 * conheça o CPF deriva exatamente o mesmo `FUN12345678900` sem precisar de
 * banco ou coordenação via Kafka. Garante identificação cross-service.
 *
 * Este serviço não cadastra funcionários — apenas referencia o código já
 * publicado pelo ms-funcionarios via evento `FuncionarioCriado`.
 */
export function gerarCodigoFuncionario(cpf: string): string {
  const cpfLimpo = cpf.replace(/\D/g, '')
  return `FUN${cpfLimpo}`
}
