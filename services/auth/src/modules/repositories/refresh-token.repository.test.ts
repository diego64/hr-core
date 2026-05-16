import { ObjectId, type Db } from 'mongodb'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { cleanCollections, closeTestDb, getTestDb } from '../../../test/db.js'
import { RefreshTokenRepository } from './refresh-token.repository.js'

describe('RefreshTokenRepository (integração com Mongo)', () => {
  let db: Db
  let repo: RefreshTokenRepository

  beforeAll(async () => {
    db = await getTestDb()
    repo = new RefreshTokenRepository(db)
  })

  beforeEach(async () => {
    await cleanCollections(db)
  })

  afterAll(async () => {
    await closeTestDb()
  })

  function makeInput(overrides: Partial<{ jtiHash: string; userId: ObjectId }> = {}) {
    return {
      jtiHash: overrides.jtiHash ?? 'hash-' + Math.random().toString(36).slice(2),
      userId: overrides.userId ?? new ObjectId(),
      issuedAt: new Date(),
      expiresAt: new Date(Date.now() + 60_000),
    }
  }

  describe('create + findByJtiHash', () => {
    it('persists and retrieves a refresh token', async () => {
      const input = makeInput()
      const created = await repo.create(input)
      expect(created.usedAt).toBeNull()
      expect(created.revokedAt).toBeNull()
      expect(created.replacedBy).toBeNull()

      const found = await repo.findByJtiHash(input.jtiHash)
      expect(found?.jtiHash).toBe(input.jtiHash)
    })

    it('accepts optional userAgent and ip and stores nulls when omitted', async () => {
      const input = { ...makeInput(), userAgent: 'curl', ip: '127.0.0.1' }
      const created = await repo.create(input)
      expect(created.userAgent).toBe('curl')
      expect(created.ip).toBe('127.0.0.1')

      const plain = await repo.create(makeInput())
      expect(plain.userAgent).toBeNull()
      expect(plain.ip).toBeNull()
    })

    it('returns null when jtiHash does not exist', async () => {
      expect(await repo.findByJtiHash('nada')).toBeNull()
    })
  })

  describe('markUsed', () => {
    it('marks an unused token as used and returns true', async () => {
      const input = makeInput()
      await repo.create(input)
      const ok = await repo.markUsed(input.jtiHash, 'next-hash')
      expect(ok).toBe(true)

      const updated = await repo.findByJtiHash(input.jtiHash)
      expect(updated?.usedAt).toBeInstanceOf(Date)
      expect(updated?.replacedBy).toBe('next-hash')
    })

    it('returns false for a token already used (double-use race)', async () => {
      const input = makeInput()
      await repo.create(input)
      await repo.markUsed(input.jtiHash, 'next-1')
      const second = await repo.markUsed(input.jtiHash, 'next-2')
      expect(second).toBe(false)
    })

    it('returns false for a revoked token', async () => {
      const input = makeInput()
      await repo.create(input)
      await repo.revokeByJtiHash(input.jtiHash)
      const ok = await repo.markUsed(input.jtiHash, 'next')
      expect(ok).toBe(false)
    })

    it('returns false for a nonexistent jtiHash', async () => {
      expect(await repo.markUsed('does-not-exist', 'next')).toBe(false)
    })
  })

  describe('revokeAllForUser', () => {
    it('revokes every active token for the user and counts them', async () => {
      const userId = new ObjectId()
      const otherUserId = new ObjectId()
      await repo.create(makeInput({ userId }))
      await repo.create(makeInput({ userId }))
      await repo.create(makeInput({ userId }))
      await repo.create(makeInput({ userId: otherUserId }))

      const n = await repo.revokeAllForUser(userId)
      expect(n).toBe(3)

      // o do outro user continua intacto
      const otherDoc = (await db
        .collection<{ jtiHash: string }>('refresh_tokens')
        .findOne({ userId: otherUserId }))!
      const allOther = await repo.findByJtiHash(otherDoc.jtiHash)
      expect(allOther?.revokedAt).toBeNull()
    })

    it('does not re-revoke already revoked tokens', async () => {
      const userId = new ObjectId()
      const input = makeInput({ userId })
      await repo.create(input)
      await repo.revokeByJtiHash(input.jtiHash)

      const n = await repo.revokeAllForUser(userId)
      expect(n).toBe(0)
    })
  })

  describe('revokeByJtiHash', () => {
    it('revokes a specific token and returns true', async () => {
      const input = makeInput()
      await repo.create(input)
      expect(await repo.revokeByJtiHash(input.jtiHash)).toBe(true)
      const updated = await repo.findByJtiHash(input.jtiHash)
      expect(updated?.revokedAt).toBeInstanceOf(Date)
    })

    it('returns false when token is already revoked', async () => {
      const input = makeInput()
      await repo.create(input)
      await repo.revokeByJtiHash(input.jtiHash)
      expect(await repo.revokeByJtiHash(input.jtiHash)).toBe(false)
    })

    it('returns false for a nonexistent token (idempotent)', async () => {
      expect(await repo.revokeByJtiHash('nada')).toBe(false)
    })
  })
})
