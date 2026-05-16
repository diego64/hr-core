import { createHash, randomUUID } from 'node:crypto'

import { SignJWT } from 'jose'

import { env } from '../../config/env.js'
import type { ActiveKey } from './key.service.js'

export interface TokenPair {
  readonly accessToken: string
  readonly refreshToken: string
  readonly accessTokenExpiresAt: Date
  readonly refreshTokenJti: string
  readonly refreshTokenJtiHash: string
  readonly refreshTokenExpiresAt: Date
}

export interface UserClaims {
  readonly sub: string
  readonly roles: readonly string[]
}

export function hashJti(jti: string): string {
  return createHash('sha256').update(jti).digest('hex')
}

/**
 * Emite um par access + refresh:
 *   - Access: JWT RS256 com claims do usuário, vida curta (AUTH_ACCESS_TOKEN_TTL).
 *   - Refresh: JWT RS256 com apenas sub + jti aleatório, vida longa
 *     (AUTH_REFRESH_TOKEN_TTL). O jti é armazenado como hash no banco para
 *     permitir detecção de reuso na próxima rotação.
 */
export async function issueTokenPair(args: {
  readonly user: UserClaims
  readonly key: ActiveKey
  readonly now?: Date
}): Promise<TokenPair> {
  const now = args.now ?? new Date()
  const issuer = env.AUTH_JWT_ISSUER
  const audience = env.AUTH_JWT_AUDIENCE

  const accessExpiresAt = new Date(now.getTime() + env.AUTH_ACCESS_TOKEN_TTL_SECONDS * 1000)
  const refreshExpiresAt = new Date(now.getTime() + env.AUTH_REFRESH_TOKEN_TTL_SECONDS * 1000)
  const jti = randomUUID()

  const accessToken = await new SignJWT({ roles: args.user.roles })
    .setProtectedHeader({ alg: 'RS256', kid: args.key.kid, typ: 'JWT' })
    .setSubject(args.user.sub)
    .setIssuer(issuer)
    .setAudience(audience)
    .setIssuedAt(Math.floor(now.getTime() / 1000))
    .setExpirationTime(Math.floor(accessExpiresAt.getTime() / 1000))
    .sign(args.key.privateKey)

  const refreshToken = await new SignJWT({ typ: 'refresh' })
    .setProtectedHeader({ alg: 'RS256', kid: args.key.kid, typ: 'JWT' })
    .setSubject(args.user.sub)
    .setIssuer(issuer)
    .setAudience(audience)
    .setJti(jti)
    .setIssuedAt(Math.floor(now.getTime() / 1000))
    .setExpirationTime(Math.floor(refreshExpiresAt.getTime() / 1000))
    .sign(args.key.privateKey)

  return {
    accessToken,
    refreshToken,
    accessTokenExpiresAt: accessExpiresAt,
    refreshTokenJti: jti,
    refreshTokenJtiHash: hashJti(jti),
    refreshTokenExpiresAt: refreshExpiresAt,
  }
}
