import type { ObjectId } from 'mongodb'

export interface User {
  readonly _id: ObjectId
  readonly email: string
  readonly passwordHash: string
  readonly roles: readonly string[]
  readonly active: boolean
  readonly createdAt: Date
  readonly updatedAt: Date
}

export interface CreateUserInput {
  readonly email: string
  readonly passwordHash: string
  readonly roles?: readonly string[]
}

export interface PublicUser {
  readonly id: string
  readonly email: string
  readonly roles: string[]
  readonly active: boolean
  readonly createdAt: string
}

export function toPublicUser(user: User): PublicUser {
  return {
    id: user._id.toHexString(),
    email: user.email,
    roles: [...user.roles],
    active: user.active,
    createdAt: user.createdAt.toISOString(),
  }
}
