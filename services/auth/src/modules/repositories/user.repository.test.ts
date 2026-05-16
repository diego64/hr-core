import { ObjectId, type Db } from 'mongodb'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { cleanCollections, closeTestDb, getTestDb } from '../../../test/db.js'
import { UserRepository } from './user.repository.js'

describe('UserRepository (integração com Mongo)', () => {
  let db: Db
  let repo: UserRepository

  beforeAll(async () => {
    db = await getTestDb()
    repo = new UserRepository(db)
  })

  beforeEach(async () => {
    await cleanCollections(db)
  })

  afterAll(async () => {
    await closeTestDb()
  })

  describe('create', () => {
    it('persists a user with default role USUARIO when none is provided', async () => {
      const user = await repo.create({ email: 'a@x.com', passwordHash: 'h' })
      expect(user.roles).toEqual(['USUARIO'])
      expect(user.active).toBe(true)
      expect(user.createdAt).toBeInstanceOf(Date)
      expect(user.updatedAt).toBeInstanceOf(Date)
    })

    it('persists explicit roles when provided', async () => {
      const user = await repo.create({
        email: 'admin@x.com',
        passwordHash: 'h',
        roles: ['ADMINISTRADOR'],
      })
      expect(user.roles).toEqual(['ADMINISTRADOR'])
    })

    it('lowercases the email on write', async () => {
      const user = await repo.create({ email: 'CamelCase@X.com', passwordHash: 'h' })
      expect(user.email).toBe('camelcase@x.com')
    })
  })

  describe('findByEmail', () => {
    it('returns the user (case-insensitive lookup)', async () => {
      await repo.create({ email: 'find-me@x.com', passwordHash: 'h' })
      const found = await repo.findByEmail('FIND-ME@x.com')
      expect(found?.email).toBe('find-me@x.com')
    })

    it('returns null when not found', async () => {
      expect(await repo.findByEmail('nada@x.com')).toBeNull()
    })
  })

  describe('findById', () => {
    it('accepts ObjectId or string id', async () => {
      const created = await repo.create({ email: 'id@x.com', passwordHash: 'h' })
      const byObjectId = await repo.findById(created._id)
      const byString = await repo.findById(created._id.toHexString())
      expect(byObjectId?.email).toBe('id@x.com')
      expect(byString?.email).toBe('id@x.com')
    })

    it('returns null for non-existent id', async () => {
      const random = new ObjectId()
      expect(await repo.findById(random)).toBeNull()
    })
  })
})
