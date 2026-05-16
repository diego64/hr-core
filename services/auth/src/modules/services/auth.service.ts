import { jwtVerify } from 'jose'

import { env } from '../../config/env.js'
import { toPublicUser, type PublicUser, type User } from '../domain/entities/user.js'
import {
  EmailAlreadyTakenError,
  InvalidCredentialsError,
  InvalidRefreshTokenError,
  RefreshTokenReuseDetectedError,
  UserDisabledError,
} from '../domain/errors/domain-error.js'
import type { RefreshTokenRepository } from '../repositories/refresh-token.repository.js'
import type { UserRepository } from '../repositories/user.repository.js'
import type { ActiveKey } from './key.service.js'
import { hashPassword, verifyPassword } from './password.service.js'
import { hashJti, issueTokenPair, type TokenPair } from './token.service.js'

export interface SessionContext {
  readonly userAgent?: string | null
  readonly ip?: string | null
}

export interface AuthResult {
  readonly user: PublicUser
  readonly tokens: TokenPair
}

export class AuthService {
  constructor(
    private readonly userRepo: UserRepository,
    private readonly refreshRepo: RefreshTokenRepository,
    private readonly key: ActiveKey,
  ) {}

  async register(args: {
    readonly email: string
    readonly password: string
    readonly context?: SessionContext
  }): Promise<AuthResult> {
    const existing = await this.userRepo.findByEmail(args.email)
    if (existing) throw new EmailAlreadyTakenError(args.email)

    const passwordHash = await hashPassword(args.password)
    const user = await this.userRepo.create({ email: args.email, passwordHash })

    return this.completeAuth(user, args.context)
  }

  async login(args: {
    readonly email: string
    readonly password: string
    readonly context?: SessionContext
  }): Promise<AuthResult> {
    const user = await this.userRepo.findByEmail(args.email)
    if (!user) throw new InvalidCredentialsError()

    const matches = await verifyPassword(args.password, user.passwordHash)
    if (!matches) throw new InvalidCredentialsError()
    if (!user.active) throw new UserDisabledError()

    return this.completeAuth(user, args.context)
  }

  async refresh(args: {
    readonly refreshToken: string
    readonly context?: SessionContext
  }): Promise<AuthResult> {
    let payload
    try {
      const verified = await jwtVerify(args.refreshToken, this.key.publicKey, {
        issuer: env.AUTH_JWT_ISSUER,
        audience: env.AUTH_JWT_AUDIENCE,
      })
      payload = verified.payload
    } catch {
      throw new InvalidRefreshTokenError()
    }

    if (
      payload.typ !== 'refresh' ||
      typeof payload.jti !== 'string' ||
      typeof payload.sub !== 'string'
    ) {
      throw new InvalidRefreshTokenError()
    }

    const jtiHash = hashJti(payload.jti)
    const stored = await this.refreshRepo.findByJtiHash(jtiHash)
    if (!stored) throw new InvalidRefreshTokenError()

    // Reuse detection: se já foi usado ou revogado, mata toda a cadeia do usuário.
    if (stored.usedAt !== null || stored.revokedAt !== null) {
      await this.refreshRepo.revokeAllForUser(stored.userId)
      throw new RefreshTokenReuseDetectedError()
    }

    if (stored.expiresAt.getTime() <= Date.now()) {
      throw new InvalidRefreshTokenError()
    }

    const user = await this.userRepo.findById(stored.userId)
    if (!user) throw new InvalidRefreshTokenError()
    if (!user.active) throw new UserDisabledError()

    // Emite o novo par PRIMEIRO; só marca o antigo como usado se conseguimos
    // persistir o novo. Caso contrário o cliente pode terminar sem token
    // válido nem refresh válido.
    const tokens = await issueTokenPair({
      user: { sub: user._id.toHexString(), roles: user.roles },
      key: this.key,
    })

    await this.refreshRepo.create({
      jtiHash: tokens.refreshTokenJtiHash,
      userId: user._id,
      issuedAt: new Date(),
      expiresAt: tokens.refreshTokenExpiresAt,
      userAgent: args.context?.userAgent ?? null,
      ip: args.context?.ip ?? null,
    })

    const marked = await this.refreshRepo.markUsed(jtiHash, tokens.refreshTokenJtiHash)
    if (!marked) {
      // Race: outra request consumiu o token entre nosso findByJtiHash e o
      // markUsed. Trata como reuse — revoga tudo.
      await this.refreshRepo.revokeAllForUser(stored.userId)
      throw new RefreshTokenReuseDetectedError()
    }

    return { user: toPublicUser(user), tokens }
  }

  async logout(args: { readonly refreshToken: string }): Promise<void> {
    let payload
    try {
      const verified = await jwtVerify(args.refreshToken, this.key.publicKey, {
        issuer: env.AUTH_JWT_ISSUER,
        audience: env.AUTH_JWT_AUDIENCE,
      })
      payload = verified.payload
    } catch {
      // Idempotente: token inválido na resposta é OK — a sessão já estava morta.
      return
    }

    if (payload.typ !== 'refresh' || typeof payload.jti !== 'string') return
    await this.refreshRepo.revokeByJtiHash(hashJti(payload.jti))
  }

  private async completeAuth(user: User, context?: SessionContext): Promise<AuthResult> {
    const tokens = await issueTokenPair({
      user: { sub: user._id.toHexString(), roles: user.roles },
      key: this.key,
    })

    await this.refreshRepo.create({
      jtiHash: tokens.refreshTokenJtiHash,
      userId: user._id,
      issuedAt: new Date(),
      expiresAt: tokens.refreshTokenExpiresAt,
      userAgent: context?.userAgent ?? null,
      ip: context?.ip ?? null,
    })

    return { user: toPublicUser(user), tokens }
  }
}
