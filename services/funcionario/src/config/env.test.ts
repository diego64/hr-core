/**
 * Cobre a branch de erro do parser de env. Em condições normais, o módulo
 * dá throw no top-level (parsing acontece no import). Para testar o caso
 * negativo, removemos as envs obrigatórias e re-importamos via vi.resetModules.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

describe('config/env', () => {
  beforeEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  it('parse OK com envs do setup global → exporta env tipado', async () => {
    const mod = await import('./env.js')
    expect(mod.env.NODE_ENV).toBe('test')
    expect(mod.env.MONGO_URL).toBeTruthy()
    expect(mod.env.AUTH_JWKS_URL).toBeTruthy()
  })

  function stubBaseEnvs(): void {
    vi.stubEnv('AUTH_JWKS_URL', 'http://x/.well-known/jwks.json')
    vi.stubEnv('AUTH_JWT_ISSUER', 'https://x')
    vi.stubEnv('AUTH_JWT_AUDIENCE', 'x')
    vi.stubEnv('S3_ENDPOINT', 'http://localhost:9100')
    vi.stubEnv('S3_ACCESS_KEY', 'k')
    vi.stubEnv('S3_SECRET_KEY', 's')
  }

  it('faltando MONGO_URL → throw descritivo com nome do campo', async () => {
    stubBaseEnvs()
    vi.stubEnv('MONGO_URL', '')
    await expect(import('./env.js')).rejects.toThrow(/Invalid environment configuration/)
  })

  it('faltando AUTH_JWT_ISSUER → mensagem do Zod aponta o campo', async () => {
    stubBaseEnvs()
    vi.stubEnv('MONGO_URL', 'mongodb://localhost:27018')
    vi.stubEnv('AUTH_JWT_ISSUER', '')
    await expect(import('./env.js')).rejects.toThrow(/AUTH_JWT_ISSUER/)
  })

  it('AUTH_JWKS_URL inválida → throw', async () => {
    stubBaseEnvs()
    vi.stubEnv('MONGO_URL', 'mongodb://localhost:27018')
    vi.stubEnv('AUTH_JWKS_URL', 'isso-nao-eh-url')
    await expect(import('./env.js')).rejects.toThrow(/Invalid environment configuration/)
  })

  it('faltando S3_ENDPOINT → throw', async () => {
    stubBaseEnvs()
    vi.stubEnv('MONGO_URL', 'mongodb://localhost:27018')
    vi.stubEnv('S3_ENDPOINT', '')
    await expect(import('./env.js')).rejects.toThrow(/S3_ENDPOINT/)
  })
})
