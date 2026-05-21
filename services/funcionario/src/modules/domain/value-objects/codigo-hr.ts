/**
 * Código do processo HR — identificador do processo de admissão.
 *
 * Sequencial via collection `contadores` (atômico, sem race), formato:
 *   HR + zeros à esquerda + número, mínimo 7 dígitos.
 *   Cresce naturalmente além de 7 dígitos (HR9999999 → HR10000000).
 *
 * Imutável após criação; nunca reutilizado, mesmo após soft delete do
 * funcionário (recontratação gera novo HR, mantém o FUN do CPF).
 */
export function gerarCodigoHR(sequencia: number): string {
  if (!Number.isInteger(sequencia) || sequencia <= 0) {
    throw new Error(`Sequência inválida para código HR: ${sequencia}`)
  }
  const numero = String(sequencia)
  const zeros = Math.max(0, 7 - numero.length)
  return `HR${'0'.repeat(zeros)}${numero}`
}
