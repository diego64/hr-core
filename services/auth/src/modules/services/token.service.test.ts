import { decodeJwt, decodeProtectedHeader, jwtVerify } from 'jose'
import { beforeAll, describe, expect, it } from 'vitest'

import { env } from '../../config/env.js'
import { loadActiveKey, type ActiveKey } from './key.service.js'
import { hashJti, issueTokenPair } from './token.service.js'

describe('token.service', () => {
  let key: ActiveKey

  beforeAll(async () => {
    key = await loadActiveKey()
  })

  describe('hashJti', () => {
    it('returns a 64-char hex string (SHA-256)', () => {
      const h = hashJti('any-jti')
      expect(h).toMatch(/^[0-9a-f]{64}$/)
    })

    it('is deterministic for the same input', () => {
      expect(hashJti('abc')).toEqual(hashJti('abc'))
    })

    it('differs for different inputs', () => {
      expect(hashJti('abc')).not.toEqual(hashJti('abd'))
    })
  })

  describe('issueTokenPair', () => {
    it('issues access + refresh tokens with the same kid', async () => {
      const pair = await issueTokenPair({
        user: { sub: 'user-123', roles: ['USUARIO'] },
        key,
      })
      const accessHeader = decodeProtectedHeader(pair.accessToken)
      const refreshHeader = decodeProtectedHeader(pair.refreshToken)
      expect(accessHeader.alg).toBe('RS256')
      expect(accessHeader.kid).toBe(env.AUTH_JWT_KID)
      expect(refreshHeader.alg).toBe('RS256')
      expect(refreshHeader.kid).toBe(env.AUTH_JWT_KID)
    })

    it('embeds user claims in the access token', async () => {
      const pair = await issueTokenPair({
        user: { sub: 'user-123', roles: ['ADMINISTRADOR'] },
        key,
      })
      const payload = decodeJwt(pair.accessToken)
      expect(payload.sub).toBe('user-123')
      expect(payload.roles).toEqual(['ADMINISTRADOR'])
      expect(payload.iss).toBe(env.AUTH_JWT_ISSUER)
      expect(payload.aud).toBe(env.AUTH_JWT_AUDIENCE)
      expect(payload.exp).toBeGreaterThan(payload.iat ?? 0)
    })

    it('marks the refresh token with typ=refresh and embeds a jti', async () => {
      const pair = await issueTokenPair({
        user: { sub: 'user-123', roles: ['USUARIO'] },
        key,
      })
      const payload = decodeJwt(pair.refreshToken)
      expect(payload.typ).toBe('refresh')
      expect(typeof payload.jti).toBe('string')
      expect((payload.jti ?? '').length).toBeGreaterThan(10)
    })

    it('returns matching jti and jtiHash', async () => {
      const pair = await issueTokenPair({
        user: { sub: 'user-123', roles: ['USUARIO'] },
        key,
      })
      expect(hashJti(pair.refreshTokenJti)).toEqual(pair.refreshTokenJtiHash)
    })

    it('access exp is sooner than refresh exp (different TTLs)', async () => {
      const pair = await issueTokenPair({
        user: { sub: 'user-123', roles: ['USUARIO'] },
        key,
      })
      expect(pair.accessTokenExpiresAt.getTime()).toBeLessThan(pair.refreshTokenExpiresAt.getTime())
    })

    it('uses the provided `now` to compute expiry deterministically', async () => {
      const now = new Date('2030-01-01T00:00:00.000Z')
      const pair = await issueTokenPair({
        user: { sub: 'user-123', roles: ['USUARIO'] },
        key,
        now,
      })
      expect(pair.accessTokenExpiresAt.getTime()).toBe(
        now.getTime() + env.AUTH_ACCESS_TOKEN_TTL_SECONDS * 1000,
      )
      expect(pair.refreshTokenExpiresAt.getTime()).toBe(
        now.getTime() + env.AUTH_REFRESH_TOKEN_TTL_SECONDS * 1000,
      )
    })

    it('emits tokens verifiable with the public key', async () => {
      const pair = await issueTokenPair({
        user: { sub: 'user-123', roles: ['USUARIO'] },
        key,
      })
      const { payload } = await jwtVerify(pair.accessToken, key.publicKey, {
        issuer: env.AUTH_JWT_ISSUER,
        audience: env.AUTH_JWT_AUDIENCE,
      })
      expect(payload.sub).toBe('user-123')
    })
  })
})
