import { SetorInvalidoError } from '../errors/domain-error.js'

/**
 * Setor — string canônica (trim, sem repetições de espaço, mínimo 2 chars).
 *
 * O domínio do HR Core não enumera setores ("Tecnologia", "Financeiro", "RH",
 * etc.) porque cada cliente define os seus. O ms-avaliacao apenas armazena
 * o setor declarado pelo ADMINISTRADOR ao criar o avaliador, e compara
 * literalmente com o setor do funcionário (oriundo do ms-funcionario via
 * Kafka).
 */
export function normalizarSetor(input: string): string {
  if (typeof input !== 'string') {
    throw new SetorInvalidoError('Setor precisa ser string não vazia')
  }
  const norm = input.trim().replace(/\s+/g, ' ')
  if (norm.length < 2 || norm.length > 80) {
    throw new SetorInvalidoError(
      `Setor precisa ter entre 2 e 80 caracteres. Recebido: ${norm.length}.`,
    )
  }
  return norm
}

export function setoresIguais(a: string, b: string): boolean {
  return normalizarSetor(a).toLowerCase() === normalizarSetor(b).toLowerCase()
}
