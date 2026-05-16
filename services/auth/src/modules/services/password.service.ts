import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'

import { env } from '../../config/env.js'

const scrypt = promisify(scryptCallback) as (
  password: string,
  salt: Buffer,
  keylen: number,
  options: { N: number; r: number; p: number; maxmem: number },
) => Promise<Buffer>

const KEY_LENGTH = 64
const SALT_LENGTH = 16
const FORMAT = 'scrypt'

interface ScryptParams {
  readonly N: number
  readonly r: number
  readonly p: number
}

function currentParams(): ScryptParams {
  return {
    N: 2 ** env.AUTH_SCRYPT_LOG_N,
    r: env.AUTH_SCRYPT_R,
    p: env.AUTH_SCRYPT_P,
  }
}

function maxmemFor(params: ScryptParams): number {
  // Node exige maxmem >= 128 * N * r. Damos uma folga de 2x para evitar erros
  // intermitentes em servidores com fragmentação de heap.
  return 256 * params.N * params.r
}

/**
 * Encoded format:
 *   scrypt$<logN>$<r>$<p>$<saltBase64>$<hashBase64>
 *
 * Inclui os parâmetros para permitir rotação no futuro (se mudar AUTH_SCRYPT_*,
 * hashes antigos continuam verificáveis com os parâmetros que estavam vigentes
 * na época do hash).
 */
export async function hashPassword(password: string): Promise<string> {
  const params = currentParams()
  const salt = randomBytes(SALT_LENGTH)
  const derived = await scrypt(password, salt, KEY_LENGTH, {
    ...params,
    maxmem: maxmemFor(params),
  })
  const logN = env.AUTH_SCRYPT_LOG_N
  return `${FORMAT}$${logN}$${params.r}$${params.p}$${salt.toString('base64')}$${derived.toString('base64')}`
}

export async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  const parts = encoded.split('$')
  if (parts.length !== 6 || parts[0] !== FORMAT) return false

  const [, logNStr, rStr, pStr, saltB64, hashB64] = parts
  const logN = Number(logNStr)
  const r = Number(rStr)
  const p = Number(pStr)
  if (!Number.isFinite(logN) || !Number.isFinite(r) || !Number.isFinite(p)) return false

  const params = { N: 2 ** logN, r, p }
  const salt = Buffer.from(saltB64 ?? '', 'base64')
  const expected = Buffer.from(hashB64 ?? '', 'base64')
  if (salt.length === 0 || expected.length === 0) return false

  const derived = await scrypt(password, salt, expected.length, {
    ...params,
    maxmem: maxmemFor(params),
  })

  if (derived.length !== expected.length) return false
  return timingSafeEqual(derived, expected)
}
