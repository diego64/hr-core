import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { generateKeyPairSync } from 'node:crypto'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

describe('key.service', () => {
  let workdir: string

  beforeEach(() => {
    workdir = mkdtempSync(join(tmpdir(), 'hr-auth-keys-'))
    vi.resetModules()
  })

  afterEach(() => {
    rmSync(workdir, { recursive: true, force: true })
    vi.unstubAllEnvs()
  })

  it('generates an in-memory RSA key when path is unset (dev)', async () => {
    vi.stubEnv('AUTH_PRIVATE_KEY_PATH', '')
    const mod = await import('./key.service.js')
    const key = await mod.loadActiveKey()

    expect(key.kid).toBeTruthy()
    expect(key.privateKey.asymmetricKeyType).toBe('rsa')
    expect(key.publicKey.asymmetricKeyType).toBe('rsa')
    expect(key.publicJwk.kty).toBe('RSA')
    expect(key.publicJwk.alg).toBe('RS256')
    expect(key.publicJwk.use).toBe('sig')
    expect(key.publicJwk.kid).toBe(key.kid)
  })

  it('reads the private key from AUTH_PRIVATE_KEY_PATH when the file exists', async () => {
    const { privateKey: pem } = generateKeyPairSync('rsa', {
      modulusLength: 2048,
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
      publicKeyEncoding: { type: 'spki', format: 'pem' },
    })
    const path = join(workdir, 'private.pem')
    writeFileSync(path, pem)
    vi.stubEnv('AUTH_PRIVATE_KEY_PATH', path)

    const mod = await import('./key.service.js')
    const key = await mod.loadActiveKey()

    expect(key.privateKey.asymmetricKeyType).toBe('rsa')
    expect(key.publicJwk.kty).toBe('RSA')
  })

  it('falls back to in-memory key when path is invalid in dev/test', async () => {
    vi.stubEnv('AUTH_PRIVATE_KEY_PATH', join(workdir, 'does-not-exist.pem'))
    const mod = await import('./key.service.js')
    const key = await mod.loadActiveKey()
    expect(key.privateKey.asymmetricKeyType).toBe('rsa')
  })

  it('throws hard when AUTH_PRIVATE_KEY_PATH points to a missing file in production', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('AUTH_PRIVATE_KEY_PATH', join(workdir, 'missing.pem'))

    const mod = await import('./key.service.js')
    await expect(mod.loadActiveKey()).rejects.toThrow(/AUTH_PRIVATE_KEY_PATH/)
  })

  it('throws hard when AUTH_PRIVATE_KEY_PATH is unset in production', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('AUTH_PRIVATE_KEY_PATH', '')

    const mod = await import('./key.service.js')
    await expect(mod.loadActiveKey()).rejects.toThrow(/required in production/)
  })
})
