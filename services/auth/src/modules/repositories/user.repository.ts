import { type Db, type Collection, ObjectId } from 'mongodb'

import type { CreateUserInput, User } from '../domain/entities/user.js'

export class UserRepository {
  private readonly collection: Collection<User>

  constructor(db: Db) {
    this.collection = db.collection<User>('users')
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.collection.findOne({ email: email.toLowerCase() })
  }

  async findById(id: string | ObjectId): Promise<User | null> {
    const objectId = typeof id === 'string' ? new ObjectId(id) : id
    return this.collection.findOne({ _id: objectId })
  }

  async create(input: CreateUserInput): Promise<User> {
    const now = new Date()
    const document = {
      _id: new ObjectId(),
      email: input.email.toLowerCase(),
      passwordHash: input.passwordHash,
      roles: input.roles ?? ['USUARIO'],
      active: true,
      createdAt: now,
      updatedAt: now,
    } satisfies User

    await this.collection.insertOne(document)
    return document
  }
}
