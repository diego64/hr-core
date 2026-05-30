/**
 * Cálculo do IRRF — Tabela 2024.
 *
 * Base de cálculo = SalárioBruto − INSS − (R$ 189,59 × numeroDependentes)
 *
 * | Base após dedução                     | Alíquota | Dedução    |
 * |---------------------------------------|----------|------------|
 * | Até R$ 2.259,20                       | Isento   | —          |
 * | De R$ 2.259,21 até R$ 2.826,65        | 7,5%     | R$ 169,44  |
 * | De R$ 2.826,66 até R$ 3.751,05        | 15,0%    | R$ 381,44  |
 * | De R$ 3.751,06 até R$ 4.664,68        | 22,5%    | R$ 662,77  |
 * | Acima de R$ 4.664,68                  | 27,5%    | R$ 896,00  |
 */
const FAIXAS_IRRF = [
  { limite: 2_259.2, aliquota: 0, deducao: 0 },
  { limite: 2_826.65, aliquota: 0.075, deducao: 169.44 },
  { limite: 3_751.05, aliquota: 0.15, deducao: 381.44 },
  { limite: 4_664.68, aliquota: 0.225, deducao: 662.77 },
  { limite: Number.POSITIVE_INFINITY, aliquota: 0.275, deducao: 896.0 },
] as const

export const DEDUCAO_POR_DEPENDENTE = 189.59

const CENTAVOS_FACTOR = 100

function arredondar2(valor: number): number {
  return Math.round(valor * CENTAVOS_FACTOR) / CENTAVOS_FACTOR
}

export interface CalculoIRRFInput {
  readonly baseCalculo: number
  readonly numeroDependentes: number
}

export function calcularIRRF(input: CalculoIRRFInput): number {
  const { baseCalculo, numeroDependentes } = input
  if (baseCalculo < 0) throw new Error('baseCalculo não pode ser negativa')
  if (numeroDependentes < 0) throw new Error('numeroDependentes não pode ser negativo')

  const baseLiquida = baseCalculo - DEDUCAO_POR_DEPENDENTE * numeroDependentes
  if (baseLiquida <= 0) return 0

  for (const faixa of FAIXAS_IRRF) {
    if (baseLiquida <= faixa.limite) {
      const valor = baseLiquida * faixa.aliquota - faixa.deducao
      return arredondar2(Math.max(0, valor))
    }
  }
  return 0 // unreachable — última faixa é +Infinity
}

export const IRRF_TABELA = {
  faixas: FAIXAS_IRRF,
  deducaoPorDependente: DEDUCAO_POR_DEPENDENTE,
} as const
