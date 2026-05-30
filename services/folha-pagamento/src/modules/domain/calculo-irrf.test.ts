import { describe, expect, it } from 'vitest'

import { calcularIRRF, DEDUCAO_POR_DEPENDENTE, IRRF_TABELA } from './calculo-irrf.js'

describe('domain/calcularIRRF — Tabela 2024', () => {
  it('base até R$ 2.259,20 → isento', () => {
    expect(calcularIRRF({ baseCalculo: 2_259.2, numeroDependentes: 0 })).toBe(0)
    expect(calcularIRRF({ baseCalculo: 1_500, numeroDependentes: 0 })).toBe(0)
  })

  it('faixa 7,5% — base no topo: 2826,65 * 7,5% - 169,44 = 42,5588 → 42,56', () => {
    const r = calcularIRRF({ baseCalculo: 2_826.65, numeroDependentes: 0 })
    expect(r).toBeCloseTo(42.56, 2)
  })

  it('faixa 15% — base 3.500: 3.500 * 15% - 381,44 = 143,56', () => {
    const r = calcularIRRF({ baseCalculo: 3_500, numeroDependentes: 0 })
    expect(r).toBeCloseTo(143.56, 2)
  })

  it('faixa 22,5% — base 4.000: 4.000 * 22,5% - 662,77 = 237,23', () => {
    const r = calcularIRRF({ baseCalculo: 4_000, numeroDependentes: 0 })
    expect(r).toBeCloseTo(237.23, 2)
  })

  it('faixa 27,5% — base 10.000: 10.000 * 27,5% - 896 = 1.854', () => {
    const r = calcularIRRF({ baseCalculo: 10_000, numeroDependentes: 0 })
    expect(r).toBeCloseTo(1_854, 2)
  })

  it('dedução por dependente — 2 dependentes em base 3.500', () => {
    // baseLiquida = 3.500 - 2 * 189,59 = 3.500 - 379,18 = 3.120,82
    // 3.120,82 * 15% - 381,44 = 86,683 → 86,68
    const r = calcularIRRF({ baseCalculo: 3_500, numeroDependentes: 2 })
    expect(r).toBeCloseTo(86.68, 2)
  })

  it('dedução por dependente pode zerar IRRF', () => {
    // baseLiquida = 2.300 - 1 * 189,59 = 2.110,41 → isento
    expect(calcularIRRF({ baseCalculo: 2_300, numeroDependentes: 1 })).toBe(0)
  })

  it('rejeita valores negativos', () => {
    expect(() => calcularIRRF({ baseCalculo: -1, numeroDependentes: 0 })).toThrow(/baseCalculo/)
    expect(() => calcularIRRF({ baseCalculo: 3_000, numeroDependentes: -1 })).toThrow(
      /numeroDependentes/,
    )
  })

  it('exporta constantes de referência', () => {
    expect(DEDUCAO_POR_DEPENDENTE).toBe(189.59)
    expect(IRRF_TABELA.faixas).toHaveLength(5)
  })
})
