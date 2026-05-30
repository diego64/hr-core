/**
 * Código legível da folha de pagamento.
 *
 * Formato: `FOLHA` + sequencial com 6 dígitos (zero-padded). Cresce naturalmente
 * acima de 6 dígitos quando a sequência ultrapassa 999999.
 *
 * A geração da sequência é responsabilidade do `ContadorRepository`
 * (`findOneAndUpdate` com `$inc` + `upsert`). Esta função apenas formata.
 */
export function gerarCodigoFolha(sequencia: number): string {
  const numero = String(sequencia)
  const zeros = Math.max(0, 6 - numero.length)
  return `FOLHA${'0'.repeat(zeros)}${numero}`
}
