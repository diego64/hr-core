import { describe, expect, it } from 'vitest'

import { gerarCodigoFolha } from './codigo-folha.js'

describe('domain/codigo-folha', () => {
  it('formata sequencia 1 como FOLHA000001 (6 dígitos zero-padded)', () => {
    expect(gerarCodigoFolha(1)).toBe('FOLHA000001')
  })

  it('formata sequencia 999999 como FOLHA999999', () => {
    expect(gerarCodigoFolha(999_999)).toBe('FOLHA999999')
  })

  it('cresce acima de 6 dígitos sem truncar', () => {
    expect(gerarCodigoFolha(1_000_000)).toBe('FOLHA1000000')
    expect(gerarCodigoFolha(12_345_678)).toBe('FOLHA12345678')
  })
})
