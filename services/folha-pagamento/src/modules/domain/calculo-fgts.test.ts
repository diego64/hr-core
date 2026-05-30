import { describe, expect, it } from 'vitest'

import { ALIQUOTA_FGTS, calcularFGTS } from './calculo-fgts.js'

describe('domain/calcularFGTS', () => {
  it('FGTS = 8% do salário bruto', () => {
    expect(calcularFGTS(0)).toBe(0)
    expect(calcularFGTS(1_000)).toBe(80)
    expect(calcularFGTS(5_000)).toBe(400)
    expect(calcularFGTS(10_000)).toBe(800)
  })

  it('arredonda a 2 casas (centavos)', () => {
    // 1.234,56 * 0,08 = 98,7648 → 98,76
    expect(calcularFGTS(1_234.56)).toBeCloseTo(98.76, 2)
  })

  it('alíquota constante 8% exposta', () => {
    expect(ALIQUOTA_FGTS).toBe(0.08)
  })

  it('rejeita salário negativo', () => {
    expect(() => calcularFGTS(-1)).toThrow(/salarioBruto/)
  })
})
