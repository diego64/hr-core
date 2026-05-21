import { describe, expect, it } from 'vitest'

import { isValidRole, ROLES } from './roles.js'

describe('domain.roles', () => {
  it('exporta os 3 roles canônicos', () => {
    expect(ROLES).toEqual(['ADMINISTRADOR', 'COORDENADOR', 'USUARIO'])
  })

  it('isValidRole aceita os 3 valores oficiais', () => {
    expect(isValidRole('ADMINISTRADOR')).toBe(true)
    expect(isValidRole('COORDENADOR')).toBe(true)
    expect(isValidRole('USUARIO')).toBe(true)
  })

  it('isValidRole rejeita valores desconhecidos / case errado', () => {
    expect(isValidRole('admin')).toBe(false)
    expect(isValidRole('Coordenador')).toBe(false)
    expect(isValidRole('')).toBe(false)
  })
})
