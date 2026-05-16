import { describe, expect, it } from 'vitest'

import {
  DomainError,
  EmailAlreadyTakenError,
  InvalidCredentialsError,
  InvalidRefreshTokenError,
  RefreshTokenReuseDetectedError,
  UserDisabledError,
} from './domain-error.js'

describe('domain.errors', () => {
  describe('DomainError', () => {
    it('captures code/statusCode/title and exposes a JS Error message', () => {
      const err = new DomainError({
        code: 'custom-code',
        title: 'Custom Title',
        message: 'something happened',
        statusCode: 418,
      })
      expect(err).toBeInstanceOf(Error)
      expect(err.name).toBe('DomainError')
      expect(err.code).toBe('custom-code')
      expect(err.title).toBe('Custom Title')
      expect(err.message).toBe('something happened')
      expect(err.statusCode).toBe(418)
    })
  })

  describe('subclasses', () => {
    it('EmailAlreadyTakenError → 409 + email no detail', () => {
      const err = new EmailAlreadyTakenError('user@x.com')
      expect(err.code).toBe('email-already-taken')
      expect(err.statusCode).toBe(409)
      expect(err.message).toContain('user@x.com')
    })

    it('InvalidCredentialsError → 401 com mensagem genérica (anti-enumeração)', () => {
      const err = new InvalidCredentialsError()
      expect(err.code).toBe('invalid-credentials')
      expect(err.statusCode).toBe(401)
      // não deve mencionar especificamente "email" nem "senha" pra não
      // permitir enumeração: a mensagem unifica os dois casos
      expect(err.message).toBe('Invalid email or password')
    })

    it('UserDisabledError → 403', () => {
      const err = new UserDisabledError()
      expect(err.code).toBe('user-disabled')
      expect(err.statusCode).toBe(403)
    })

    it('InvalidRefreshTokenError → 401', () => {
      const err = new InvalidRefreshTokenError()
      expect(err.code).toBe('invalid-refresh-token')
      expect(err.statusCode).toBe(401)
    })

    it('RefreshTokenReuseDetectedError → 401 + menciona revogação em cascata', () => {
      const err = new RefreshTokenReuseDetectedError()
      expect(err.code).toBe('refresh-token-reuse-detected')
      expect(err.statusCode).toBe(401)
      expect(err.message).toMatch(/revoked/i)
    })
  })
})
