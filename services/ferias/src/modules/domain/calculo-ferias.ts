/**
 * Cálculo do valor de férias (CLT padrão + 1/3 constitucional).
 *
 * Formula (art. 142 CLT + Constituição):
 *   ValorFerias = (SalarioBruto / 30) * DiasGozo
 *   ValorTerco  = ValorFerias / 3
 *   ValorAbono  = (SalarioBruto / 30) * DiasAbono  (quando abonoPecuniario=true)
 *   TercoAbono  = ValorAbono / 3
 *   ValorTotal  = ValorFerias + ValorTerco + ValorAbono + TercoAbono
 *
 * Todos os valores são arredondados para 2 casas decimais (centavos) usando
 * round-half-away-from-zero — coerente com cálculo financeiro tradicional
 * em folha de pagamento brasileira.
 */
export interface CalculoFeriasInput {
  readonly salarioBruto: number
  readonly diasGozo: number
  readonly diasAbono: number
}

export interface CalculoFeriasOutput {
  readonly valorFerias: number
  readonly valorTerco: number
  readonly valorAbono: number
  readonly valorTotal: number
}

const CENTAVOS_FACTOR = 100

function arredondar2(valor: number): number {
  return Math.round(valor * CENTAVOS_FACTOR) / CENTAVOS_FACTOR
}

export function calcularFerias(input: CalculoFeriasInput): CalculoFeriasOutput {
  const { salarioBruto, diasGozo, diasAbono } = input

  if (salarioBruto < 0) throw new Error('salarioBruto não pode ser negativo')
  if (diasGozo < 0) throw new Error('diasGozo não pode ser negativo')
  if (diasAbono < 0) throw new Error('diasAbono não pode ser negativo')

  const diaria = salarioBruto / 30
  const valorFerias = arredondar2(diaria * diasGozo)
  const valorTerco = arredondar2(valorFerias / 3)

  const valorAbonoBruto = arredondar2(diaria * diasAbono)
  const tercoAbono = arredondar2(valorAbonoBruto / 3)
  const valorAbono = arredondar2(valorAbonoBruto + tercoAbono)

  const valorTotal = arredondar2(valorFerias + valorTerco + valorAbono)

  return { valorFerias, valorTerco, valorAbono, valorTotal }
}
