import { Cpf } from './cpf.js'

/**
 * Código legível do funcionário, derivado do CPF.
 *
 * Estratégia determinística (sem coordenação):
 *   - sem precisar de banco/Kafka — qualquer serviço deriva o mesmo código
 *   - imutável por natureza (CPF não muda → código não muda)
 *   - sem conflito entre microsserviços (FUN12345678900 sempre = mesmo
 *     funcionário, em qualquer serviço do ecossistema HR Core)
 *
 * Formato: FUN + 11 dígitos do CPF sem máscara.
 */
export function gerarCodigoFuncionario(cpf: string | Cpf): string {
  const sanitized = cpf instanceof Cpf ? cpf.value : Cpf.parse(cpf).value
  return `FUN${sanitized}`
}
