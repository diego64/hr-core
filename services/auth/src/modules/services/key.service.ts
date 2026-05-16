import { createPrivateKey, createPublicKey, generateKeyPairSync, type KeyObject } from 'node:crypto'
import { readFile } from 'node:fs/promises'

import { exportJWK, type JWK } from 'jose'

import { env } from '../../config/env.js'

export interface ActiveKey {
  readonly kid: string
  readonly privateKey: KeyObject
  readonly publicKey: KeyObject
  readonly publicJwk: JWK
}

/**
 * Carrega o par de chaves RSA usado para assinar JWT.
 *   - Em production: AUTH_PRIVATE_KEY_PATH é obrigatório. Boot falha hard se
 *     não existir.
 *   - Em development/test: se o path não estiver setado ou o arquivo não
 *     existir, gera um par in-memory (perdido a cada restart — não usar em
 *     prod).
 *
 * A chave privada é mantida APENAS em memória depois de carregada. A pública é
 * exposta via JWKS endpoint.
 */
export async function loadActiveKey(): Promise<ActiveKey> {
  const kid = env.AUTH_JWT_KID
  const privateKey = await readOrGenerate()
  const publicKey = getPublicKey(privateKey)
  const publicJwk = await exportJWK(publicKey)
  publicJwk.kid = kid
  publicJwk.use = 'sig'
  publicJwk.alg = 'RS256'
  return { kid, privateKey, publicKey, publicJwk }
}

async function readOrGenerate(): Promise<KeyObject> {
  const path = env.AUTH_PRIVATE_KEY_PATH
  if (path) {
    try {
      const pem = await readFile(path, 'utf8')
      return createPrivateKey({ key: pem, format: 'pem' })
    } catch (cause) {
      if (env.NODE_ENV === 'production') {
        throw new Error(
          `Failed to read AUTH_PRIVATE_KEY_PATH=${path}: ${(cause as Error).message}`,
          {
            cause,
          },
        )
      }
      // Em dev/test, fallback silencioso para chave em memória.
    }
  }

  if (env.NODE_ENV === 'production') {
    throw new Error('AUTH_PRIVATE_KEY_PATH is required in production')
  }

  const { privateKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  })
  return createPrivateKey({ key: privateKey, format: 'pem' })
}

function getPublicKey(privateKey: KeyObject): KeyObject {
  return createPublicKey(privateKey)
}
