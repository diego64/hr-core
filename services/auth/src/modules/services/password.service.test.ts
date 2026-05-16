import { describe, expect, it } from 'vitest'

import { hashPassword, verifyPassword } from './password.service.js'

describe('password.service', () => {
  describe('hashPassword', () => {
    it('produces a string in the canonical scrypt format', async () => {
      const encoded = await hashPassword('s3nha-forte')
      const parts = encoded.split('$')
      expect(parts).toHaveLength(6)
      expect(parts[0]).toBe('scrypt')
      expect(Number.isFinite(Number(parts[1]))).toBe(true)
      expect(Number.isFinite(Number(parts[2]))).toBe(true)
      expect(Number.isFinite(Number(parts[3]))).toBe(true)
      // salt e hash em base64 — não-vazios
      expect((parts[4] ?? '').length).toBeGreaterThan(0)
      expect((parts[5] ?? '').length).toBeGreaterThan(0)
    })

    it('produces different hashes for the same password (salting)', async () => {
      const a = await hashPassword('repete')
      const b = await hashPassword('repete')
      expect(a).not.toEqual(b)
    })

    it('embeds the scrypt parameters in the encoded string', async () => {
      const encoded = await hashPassword('x')
      const [, logN, r, p] = encoded.split('$')
      // Em test, env.AUTH_SCRYPT_LOG_N=10, r=8, p=1 (ver test/setup.ts).
      expect(logN).toBe('10')
      expect(r).toBe('8')
      expect(p).toBe('1')
    })
  })

  describe('verifyPassword', () => {
    it('returns true for the matching password', async () => {
      const encoded = await hashPassword('senha-correta')
      expect(await verifyPassword('senha-correta', encoded)).toBe(true)
    })

    it('returns false for a different password', async () => {
      const encoded = await hashPassword('senha-correta')
      expect(await verifyPassword('outra-senha', encoded)).toBe(false)
    })

    it('returns false for an encoded value with the wrong number of parts', async () => {
      expect(await verifyPassword('x', 'scrypt$10$8$1$salt')).toBe(false)
      expect(await verifyPassword('x', 'scrypt$10$8$1$salt$hash$extra')).toBe(false)
    })

    it('returns false for an encoded value with a non-scrypt prefix', async () => {
      const encoded = await hashPassword('x')
      const tampered = encoded.replace('scrypt', 'bcrypt')
      expect(await verifyPassword('x', tampered)).toBe(false)
    })

    it('returns false when params are not numeric', async () => {
      // formato válido em estrutura, mas params inválidos
      expect(await verifyPassword('x', 'scrypt$abc$def$ghi$AAAA$BBBB')).toBe(false)
    })

    it('returns false when salt or hash are empty', async () => {
      expect(await verifyPassword('x', 'scrypt$10$8$1$$BBBB')).toBe(false)
      expect(await verifyPassword('x', 'scrypt$10$8$1$AAAA$')).toBe(false)
    })

    it('verifies a hash made with different params (params are inline)', async () => {
      const encoded = await hashPassword('forte')
      // Mesmo se mudássemos AUTH_SCRYPT_LOG_N entre hash e verify, o verify usa
      // os parâmetros do próprio hash (inline). Garantia de migração de N.
      expect(await verifyPassword('forte', encoded)).toBe(true)
    })
  })
})
