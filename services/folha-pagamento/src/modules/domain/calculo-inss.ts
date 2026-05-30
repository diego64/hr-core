/**
 * Cálculo do INSS — Tabela progressiva 2024.
 *
 * | Faixa salarial                        | Alíquota         |
 * |---------------------------------------|------------------|
 * | Até R$ 1.412,00                       | 7,5%             |
 * | R$ 1.412,01 até R$ 2.666,68           | 9,0%             |
 * | R$ 2.666,69 até R$ 4.000,03           | 12,0%            |
 * | R$ 4.000,04 até R$ 7.786,02           | 14,0%            |
 * | Acima de R$ 7.786,02                  | Teto R$ 908,86   |
 *
 * O cálculo é **progressivo** — cada faixa incide apenas sobre a parcela do
 * salário dentro dela. Acima do teto, o desconto fica fixado em R$ 908,86.
 *
 * Valores arredondados a 2 casas decimais (centavos).
 */
const FAIXAS_INSS = [
  { limite: 1_412.0, aliquota: 0.075 },
  { limite: 2_666.68, aliquota: 0.09 },
  { limite: 4_000.03, aliquota: 0.12 },
  { limite: 7_786.02, aliquota: 0.14 },
] as const

const TETO_INSS = 908.86

const CENTAVOS_FACTOR = 100

function arredondar2(valor: number): number {
  return Math.round(valor * CENTAVOS_FACTOR) / CENTAVOS_FACTOR
}

export function calcularINSS(salarioBruto: number): number {
  if (salarioBruto < 0) throw new Error('salarioBruto não pode ser negativo')
  if (salarioBruto === 0) return 0

  // Acima do teto da última faixa → desconto fixo no teto
  const ultimaFaixa = FAIXAS_INSS[FAIXAS_INSS.length - 1]
  if (ultimaFaixa && salarioBruto > ultimaFaixa.limite) return TETO_INSS

  let inss = 0
  let limiteAnterior = 0

  for (const faixa of FAIXAS_INSS) {
    const tetoFaixa = Math.min(salarioBruto, faixa.limite)
    if (tetoFaixa <= limiteAnterior) break

    const parcela = tetoFaixa - limiteAnterior
    inss += parcela * faixa.aliquota
    limiteAnterior = faixa.limite

    if (salarioBruto <= faixa.limite) break
  }

  return Math.min(arredondar2(inss), TETO_INSS)
}

export const INSS_TABELA = {
  faixas: FAIXAS_INSS,
  teto: TETO_INSS,
} as const
