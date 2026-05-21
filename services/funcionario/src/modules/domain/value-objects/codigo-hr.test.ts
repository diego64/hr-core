import { describe, expect, it } from 'vitest'

import { gerarCodigoHR } from './codigo-hr.js'

describe('gerarCodigoHR', () => {
  it('aplica zeros à esquerda até 7 dígitos', () => {
    expect(gerarCodigoHR(1)).toBe('HR0000001')
    expect(gerarCodigoHR(42)).toBe('HR0000042')
    expect(gerarCodigoHR(9999999)).toBe('HR9999999')
  })

  it('cresce naturalmente além de 7 dígitos', () => {
    expect(gerarCodigoHR(10_000_000)).toBe('HR10000000')
    expect(gerarCodigoHR(123_456_789)).toBe('HR123456789')
  })

  it('rejeita sequência <= 0 ou não-inteira', () => {
    expect(() => gerarCodigoHR(0)).toThrow()
    expect(() => gerarCodigoHR(-1)).toThrow()
    expect(() => gerarCodigoHR(1.5)).toThrow()
    expect(() => gerarCodigoHR(Number.NaN)).toThrow()
  })
})
