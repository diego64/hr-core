import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

describe('config.env', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('throws a formatted error when required envs are missing', async () => {
    // remove envs obrigatórias do test/setup.ts
    vi.stubEnv('MONGO_URL', '')
    vi.stubEnv('AUTH_JWT_ISSUER', '')
    vi.stubEnv('AUTH_JWT_AUDIENCE', '')

    await expect(import('./env.js')).rejects.toThrow(/Invalid environment configuration/)
  })

  it('lists each invalid variable in the error message', async () => {
    vi.stubEnv('AUTH_JWT_ISSUER', '')

    try {
      await import('./env.js')
      throw new Error('should have thrown')
    } catch (err) {
      const message = (err as Error).message
      expect(message).toContain('AUTH_JWT_ISSUER')
    }
  })

  it('parses successfully when all required envs are present', async () => {
    const mod = await import('./env.js')
    expect(mod.env.NODE_ENV).toBe('test')
    expect(mod.env.AUTH_JWT_ISSUER).toBe('https://auth.test')
  })

  it('coerces numeric envs from strings', async () => {
    vi.stubEnv('PORT', '9999')
    vi.stubEnv('AUTH_ACCESS_TOKEN_TTL_SECONDS', '300')
    const mod = await import('./env.js')
    expect(mod.env.PORT).toBe(9999)
    expect(mod.env.AUTH_ACCESS_TOKEN_TTL_SECONDS).toBe(300)
  })
})
