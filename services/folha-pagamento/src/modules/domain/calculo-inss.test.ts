import { describe, expect, it } from 'vitest'

import { calcularINSS, INSS_TABELA } from './calculo-inss.js'

describe('domain/calcularINSS — Tabela progressiva 2024', () => {
  it('salário 0 → INSS 0', () => {
    expect(calcularINSS(0)).toBe(0)
  })

  it('faixa 1 (até R$ 1.412): 7,5% sobre toda a base', () => {
    // 1.412 * 0,075 = 105,90
    expect(calcularINSS(1_412)).toBe(105.9)
    // 1.000 * 0,075 = 75,00
    expect(calcularINSS(1_000)).toBe(75)
  })

  it('faixa 2 (até R$ 2.666,68): progressiva 7,5% + 9%', () => {
    // 1.412 * 7,5% = 105,90
    // (2.666,68 - 1.412) * 9% = 1.254,68 * 9% = 112,9212
    // total = 218,8212 → arredonda 218,82
    expect(calcularINSS(2_666.68)).toBeCloseTo(218.82, 2)
  })

  it('faixa 3 (até R$ 4.000,03): 7,5% + 9% + 12%', () => {
    // 105,90 + 112,9212 + (4.000,03 - 2.666,68) * 12%
    //                   = 1.333,35 * 12% = 160,002
    // total ≈ 378,82
    expect(calcularINSS(4_000.03)).toBeCloseTo(378.82, 2)
  })

  it('faixa 4 (até R$ 7.786,02): retorna o teto R$ 908,86 ao atingir o topo', () => {
    expect(calcularINSS(7_786.02)).toBe(908.86)
  })

  it('acima do teto da última faixa: desconto fixo no teto R$ 908,86', () => {
    expect(calcularINSS(10_000)).toBe(908.86)
    expect(calcularINSS(50_000)).toBe(908.86)
  })

  it('rejeita salário negativo', () => {
    expect(() => calcularINSS(-1)).toThrow(/salarioBruto/)
  })

  it('exporta tabela de referência', () => {
    expect(INSS_TABELA.teto).toBe(908.86)
    expect(INSS_TABELA.faixas).toHaveLength(4)
  })

  it('valor logo abaixo do início da faixa 2 mantém 7,5%', () => {
    // 1.412,01 → 1.412 * 7,5% + 0,01 * 9% ≈ 105,90 + 0,0009 → 105,90
    expect(calcularINSS(1_412.01)).toBeCloseTo(105.9, 2)
  })
})
