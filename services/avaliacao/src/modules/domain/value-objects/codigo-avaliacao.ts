/**
 * Código legível da avaliação.
 *
 * Formato: `AVAL` + sequencial com 6 dígitos (zero-padded). Cresce naturalmente
 * acima de 6 dígitos quando a sequência ultrapassa 999999.
 *
 * A geração da sequência é responsabilidade do `ContadorRepository`
 * (`findOneAndUpdate` com `$inc` + `upsert`). Esta função apenas formata.
 */
export function gerarCodigoAvaliacao(sequencia: number): string {
  const numero = String(sequencia)
  const zeros = Math.max(0, 6 - numero.length)
  return `AVAL${'0'.repeat(zeros)}${numero}`
}
