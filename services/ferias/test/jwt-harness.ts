import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'

import { exportJWK, generateKeyPair, SignJWT } from 'jose'

import type { Role } from '../src/modules/domain/roles.js'

type CryptoKeyPair = Awaited<ReturnType<typeof generateKeyPair>>

/**
 * Harness de JWT para testes e2e — emite um JWKS HTTP local em-memória
 * compatível com o `auth-service` (RS256, kid `test-key`, mesmo issuer
 * e audience do auth real em produção).
 *
 * Uso:
 *
 *   const jwt = await startJwtHarness()
 *   process.env.AUTH_JWKS_URL = jwt.jwksUrl     // ANTES de buildApp()
 *   process.env.AUTH_JWT_ISSUER = jwt.issuer
 *   process.env.AUTH_JWT_AUDIENCE = jwt.audience
 *
 *   const app = await buildApp({ db })
 *   const token = await jwt.sign('user-id', ['COORDENADOR'])
 *   const res = await app.inject({ method: 'GET', url: '/solicitacoes',
 *     headers: { Authorization: `Bearer ${token}` } })
 *
 *   afterAll(async () => { await jwt.stop() })
 *
 * O serviço RPC do JWT (jose `createRemoteJWKSet`) cacheia o JWKS por
 * 10 min, então um harness por arquivo de teste é suficiente.
 */
export interface JwtHarness {
  readonly jwksUrl: string
  readonly issuer: string
  readonly audience: string
  sign(sub: string, roles: readonly Role[]): Promise<string>
  bearer(sub: string, roles: readonly Role[]): Promise<string>
  stop(): Promise<void>
}

const KID = 'test-key'
const ISSUER = 'https://auth.test'
const AUDIENCE = 'hr-core'

export async function startJwtHarness(): Promise<JwtHarness> {
  const { publicKey, privateKey }: CryptoKeyPair = await generateKeyPair('RS256', {
    extractable: true,
  })

  const jwk = await exportJWK(publicKey)
  const jwksDocument = JSON.stringify({
    keys: [{ ...jwk, kid: KID, use: 'sig', alg: 'RS256' }],
  })

  const server: Server = createServer((req, res) => {
    if (req.url === '/.well-known/jwks.json') {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(jwksDocument)
      return
    }
    res.writeHead(404).end()
  })

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address() as AddressInfo
  const jwksUrl = `http://127.0.0.1:${port}/.well-known/jwks.json`

  async function sign(sub: string, roles: readonly Role[]): Promise<string> {
    return new SignJWT({ roles: [...roles] })
      .setProtectedHeader({ alg: 'RS256', kid: KID })
      .setIssuer(ISSUER)
      .setAudience(AUDIENCE)
      .setSubject(sub)
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(privateKey)
  }

  return {
    jwksUrl,
    issuer: ISSUER,
    audience: AUDIENCE,
    sign,
    bearer: async (sub, roles) => `Bearer ${await sign(sub, roles)}`,
    stop: () =>
      new Promise((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()))
      }),
  }
}
