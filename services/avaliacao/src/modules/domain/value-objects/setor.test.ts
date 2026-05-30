import { describe, expect, it } from 'vitest'

import { SetorInvalidoError } from '../errors/domain-error.js'
import { normalizarSetor, setoresIguais } from './setor.js'

describe('normalizarSetor', () => {
  it('faz trim + colapso de espaços', () => {
    expect(normalizarSetor('  Tecnologia   ')).toBe('Tecnologia')
    expect(normalizarSetor('Recursos    Humanos')).toBe('Recursos Humanos')
  })

  it('rejeita strings abaixo de 2 caracteres', () => {
    expect(() => normalizarSetor('T')).toThrow(SetorInvalidoError)
    expect(() => normalizarSetor('   ')).toThrow(SetorInvalidoError)
  })

  it('rejeita não-string', () => {
    expect(() => normalizarSetor(123 as unknown as string)).toThrow(SetorInvalidoError)
  })

  it('rejeita acima de 80 chars', () => {
    expect(() => normalizarSetor('a'.repeat(81))).toThrow(SetorInvalidoError)
  })
})

describe('setoresIguais', () => {
  it('compara case-insensitive e ignora espaços', () => {
    expect(setoresIguais('Tecnologia', 'tecnologia')).toBe(true)
    expect(setoresIguais('Tecnologia ', '  TECNOLOGIA')).toBe(true)
  })

  it('distingue setores diferentes', () => {
    expect(setoresIguais('Tecnologia', 'Financeiro')).toBe(false)
  })
})
