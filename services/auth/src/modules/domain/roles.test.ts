import { describe, expect, it } from 'vitest'

import { isValidRole, ROLES } from './roles.js'

describe('domain.roles', () => {
  it('exports ADMINISTRADOR, COORDENADOR and USUARIO', () => {
    expect(ROLES).toContain('ADMINISTRADOR')
    expect(ROLES).toContain('COORDENADOR')
    expect(ROLES).toContain('USUARIO')
    expect(ROLES).toHaveLength(3)
  })

  it('isValidRole returns true for canonical roles', () => {
    expect(isValidRole('ADMINISTRADOR')).toBe(true)
    expect(isValidRole('COORDENADOR')).toBe(true)
    expect(isValidRole('USUARIO')).toBe(true)
  })

  it('isValidRole returns false for unknown roles', () => {
    expect(isValidRole('admin')).toBe(false)
    expect(isValidRole('coordenador')).toBe(false)
    expect(isValidRole('user')).toBe(false)
    expect(isValidRole('')).toBe(false)
    expect(isValidRole('SUPERADMIN')).toBe(false)
  })
})
