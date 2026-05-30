import { describe, expect, it } from 'vitest'

import { gerarCodigoAvaliacao } from './codigo-avaliacao.js'

describe('gerarCodigoAvaliacao', () => {
  it('formata com zero-padding de 6 dígitos', () => {
    expect(gerarCodigoAvaliacao(1)).toBe('AVAL000001')
    expect(gerarCodigoAvaliacao(42)).toBe('AVAL000042')
    expect(gerarCodigoAvaliacao(999999)).toBe('AVAL999999')
  })

  it('cresce naturalmente acima de 6 dígitos', () => {
    expect(gerarCodigoAvaliacao(1_000_000)).toBe('AVAL1000000')
  })
})
