/**
 * Helper de teste — gera um par RSA local, sobe um HTTP server que serve
 * JWKS, e oferece `sign()` pra emitir JWTs verificáveis com essa chave.
 *
 * Permite testar o `auth` plugin do gateway sem depender de Auth Service real.
 *
 * Uso:
 *   const jwks = await startJwksServer()
 *   process.env.AUTH_JWKS_URL = jwks.url
 *   const token = await jwks.sign({ sub: 'u-1', roles: ['admin'] })
 *   await app.inject({ url: '/x', headers: { authorization: `Bearer ${token}` } })
 *   await jwks.stop()
 */
import { createPrivateKey, createPublicKey, generateKeyPairSync, type KeyObject } from 'node:crypto'
import { createServer, type Server } from 'node:http'

import { SignJWT, exportJWK, type JWK } from 'jose'

export interface JwksServer {
  readonly url: string
  readonly issuer: string
  readonly audience: string
  readonly kid: string
  readonly privateKey: KeyObject
  readonly publicJwk: JWK
  sign: (
    claims: Record<string, unknown>,
    overrides?: { issuer?: string; audience?: string; expirationOffsetSeconds?: number },
  ) => Promise<string>
  stop: () => Promise<void>
}

export async function startJwksServer(
  options: { issuer?: string; audience?: string; kid?: string } = {},
): Promise<JwksServer> {
  const issuer = options.issuer ?? 'https://auth.test'
  const audience = options.audience ?? 'hr-core'
  const kid = options.kid ?? 'test-key-1'

  const { privateKey: pemPriv } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  })
  const privateKey = createPrivateKey({ key: pemPriv, format: 'pem' })
  const publicKey = createPublicKey(privateKey)
  const publicJwk = await exportJWK(publicKey)
  publicJwk.kid = kid
  publicJwk.use = 'sig'
  publicJwk.alg = 'RS256'

  const server: Server = createServer((req, res) => {
    if (req.url === '/.well-known/jwks.json' || req.url === '/jwks.json') {
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ keys: [publicJwk] }))
      return
    }
    res.writeHead(404)
    res.end()
  })

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') {
    throw new Error('failed to start JWKS server')
  }
  const url = `http://127.0.0.1:${address.port}/.well-known/jwks.json`

  async function sign(
    claims: Record<string, unknown>,
    overrides: { issuer?: string; audience?: string; expirationOffsetSeconds?: number } = {},
  ): Promise<string> {
    const now = Math.floor(Date.now() / 1000)
    const exp = now + (overrides.expirationOffsetSeconds ?? 900)
    return new SignJWT(claims)
      .setProtectedHeader({ alg: 'RS256', kid, typ: 'JWT' })
      .setIssuer(overrides.issuer ?? issuer)
      .setAudience(overrides.audience ?? audience)
      .setIssuedAt(now)
      .setExpirationTime(exp)
      .sign(privateKey)
  }

  async function stop(): Promise<void> {
    await new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve())),
    )
  }

  return { url, issuer, audience, kid, privateKey, publicJwk, sign, stop }
}
