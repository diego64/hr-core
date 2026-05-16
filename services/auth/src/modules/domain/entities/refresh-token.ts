import type { ObjectId } from 'mongodb'

/**
 * Token de refresh persistido. O `jti` (JWT ID) é armazenado APENAS como hash
 * (SHA-256 hex) — o valor em claro nunca volta a aparecer após emissão.
 *
 * Rotation:
 *   - usedAt nulo + dentro do TTL → token válido, pode ser trocado
 *   - usedAt definido → token já foi consumido; reapresentação dispara
 *     reuse-detection e revoga todos os tokens do usuário
 *   - replacedBy aponta para o jtiHash do par sucessor (cadeia auditável)
 */
export interface RefreshToken {
  readonly _id: ObjectId
  readonly jtiHash: string
  readonly userId: ObjectId
  readonly issuedAt: Date
  readonly expiresAt: Date
  readonly usedAt: Date | null
  readonly replacedBy: string | null
  readonly revokedAt: Date | null
  readonly userAgent: string | null
  readonly ip: string | null
}

export interface CreateRefreshTokenInput {
  readonly jtiHash: string
  readonly userId: ObjectId
  readonly issuedAt: Date
  readonly expiresAt: Date
  readonly userAgent?: string | null
  readonly ip?: string | null
}
