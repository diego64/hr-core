import { describe, expect, it } from 'vitest'

import { NotaInvalidaError } from '../errors/domain-error.js'
import { Nota } from './nota.js'

describe('Nota', () => {
  it.each([1, 2, 3, 4, 5])('aceita %i', (n) => {
    expect(Nota.parse(n).value).toBe(n)
  })

  it.each([0, 6, -1, 1.5, '3', null, undefined, NaN])('rejeita %s', (input) => {
    expect(() => Nota.parse(input)).toThrow(NotaInvalidaError)
  })

  it('isValid responde sem lançar', () => {
    expect(Nota.isValid(3)).toBe(true)
    expect(Nota.isValid(7)).toBe(false)
    expect(Nota.isValid('3')).toBe(false)
  })
})
