/**
 * Cálculo do FGTS — 8% sobre o salário bruto.
 *
 * O FGTS é encargo do empregador — NÃO desconta do funcionário, mas é registrado
 * na folha para controle e geração de guia GRF.
 */
export const ALIQUOTA_FGTS = 0.08

const CENTAVOS_FACTOR = 100

function arredondar2(valor: number): number {
  return Math.round(valor * CENTAVOS_FACTOR) / CENTAVOS_FACTOR
}

export function calcularFGTS(salarioBruto: number): number {
  if (salarioBruto < 0) throw new Error('salarioBruto não pode ser negativo')
  return arredondar2(salarioBruto * ALIQUOTA_FGTS)
}
