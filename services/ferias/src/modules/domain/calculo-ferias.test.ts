import { describe, expect, it } from 'vitest'

import { calcularFerias } from './calculo-ferias.js'

describe('domain/calcular-ferias', () => {
  it('30 dias de gozo sobre salario 3000 → 3000 + 1000 (terço) = 4000', () => {
    const r = calcularFerias({ salarioBruto: 3000, diasGozo: 30, diasAbono: 0 })
    expect(r.valorFerias).toBe(3000)
    expect(r.valorTerco).toBe(1000)
    expect(r.valorAbono).toBe(0)
    expect(r.valorTotal).toBe(4000)
  })

  it('20 dias de gozo + 10 dias de abono sobre 3000', () => {
    // 20 dias gozo: (3000/30)*20 = 2000; terço = 666.67
    // 10 dias abono: (3000/30)*10 = 1000; terço abono = 333.33; abono total ≈ 1333.33
    const r = calcularFerias({ salarioBruto: 3000, diasGozo: 20, diasAbono: 10 })
    expect(r.valorFerias).toBe(2000)
    expect(r.valorTerco).toBe(666.67)
    expect(r.valorAbono).toBe(1333.33)
    expect(r.valorTotal).toBeCloseTo(4000, 1)
  })

  it('14 dias mínimo (fração) sobre 4500', () => {
    const r = calcularFerias({ salarioBruto: 4500, diasGozo: 14, diasAbono: 0 })
    // diaria 150; 14 dias = 2100; terço = 700
    expect(r.valorFerias).toBe(2100)
    expect(r.valorTerco).toBe(700)
    expect(r.valorTotal).toBe(2800)
  })

  it('arredonda a 2 casas (centavos)', () => {
    const r = calcularFerias({ salarioBruto: 1234.56, diasGozo: 14, diasAbono: 0 })
    // diaria = 1234.56/30 = 41.152
    // 14 dias = 576.128 → arredonda 576.13
    // terço = 192.0427 → 192.04
    expect(r.valorFerias).toBe(576.13)
    expect(r.valorTerco).toBe(192.04)
  })

  it('salário 0 → todos os valores 0', () => {
    const r = calcularFerias({ salarioBruto: 0, diasGozo: 30, diasAbono: 0 })
    expect(r.valorFerias).toBe(0)
    expect(r.valorTotal).toBe(0)
  })

  it.each([
    [-1, 30, 0, /salarioBruto/],
    [3000, -1, 0, /diasGozo/],
    [3000, 30, -1, /diasAbono/],
  ])('rejeita valores negativos (salario=%s, gozo=%s, abono=%s)', (s, g, a, expected) => {
    expect(() => calcularFerias({ salarioBruto: s, diasGozo: g, diasAbono: a })).toThrow(expected)
  })
})
