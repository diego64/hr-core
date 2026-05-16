import { type Db, type Collection, ObjectId } from 'mongodb'

import type { CreateRefreshTokenInput, RefreshToken } from '../domain/entities/refresh-token.js'

export class RefreshTokenRepository {
  private readonly collection: Collection<RefreshToken>

  constructor(db: Db) {
    this.collection = db.collection<RefreshToken>('refresh_tokens')
  }

  async create(input: CreateRefreshTokenInput): Promise<RefreshToken> {
    const document = {
      _id: new ObjectId(),
      jtiHash: input.jtiHash,
      userId: input.userId,
      issuedAt: input.issuedAt,
      expiresAt: input.expiresAt,
      usedAt: null,
      replacedBy: null,
      revokedAt: null,
      userAgent: input.userAgent ?? null,
      ip: input.ip ?? null,
    } satisfies RefreshToken

    await this.collection.insertOne(document)
    return document
  }

  async findByJtiHash(jtiHash: string): Promise<RefreshToken | null> {
    return this.collection.findOne({ jtiHash })
  }

  /**
   * Marca um token como consumido e referencia o seu sucessor.
   * Atômico (filter inclui `usedAt: null` para evitar double-use sob race).
   * Retorna true se a atualização afetou um documento, false se já havia sido usado.
   */
  async markUsed(jtiHash: string, replacedByJtiHash: string): Promise<boolean> {
    const result = await this.collection.updateOne(
      { jtiHash, usedAt: null, revokedAt: null },
      {
        $set: {
          usedAt: new Date(),
          replacedBy: replacedByJtiHash,
        },
      },
    )
    return result.modifiedCount === 1
  }

  /**
   * Revoga TODOS os tokens de um usuário — usado quando reuso é detectado
   * (defesa em profundidade: a cadeia inteira é invalidada, forçando re-login).
   */
  async revokeAllForUser(userId: ObjectId): Promise<number> {
    const result = await this.collection.updateMany(
      { userId, revokedAt: null },
      { $set: { revokedAt: new Date() } },
    )
    return result.modifiedCount
  }

  async revokeByJtiHash(jtiHash: string): Promise<boolean> {
    const result = await this.collection.updateOne(
      { jtiHash, revokedAt: null },
      { $set: { revokedAt: new Date() } },
    )
    return result.modifiedCount === 1
  }
}
