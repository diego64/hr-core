import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

describe('config.env', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('throws com mensagem listando envs inválidas quando obrigatórias faltam', async () => {
    vi.stubEnv('AUTH_JWKS_URL', '')
    vi.stubEnv('AUTH_JWT_ISSUER', '')
    vi.stubEnv('FUNCIONARIO_SERVICE_URL', '')
    await expect(import('./env.js')).rejects.toThrow(/Invalid environment configuration/)
  })

  it('lista cada variável inválida na mensagem', async () => {
    vi.stubEnv('AUTH_JWT_ISSUER', '')
    try {
      await import('./env.js')
      throw new Error('should have thrown')
    } catch (err) {
      const msg = (err as Error).message
      expect(msg).toContain('AUTH_JWT_ISSUER')
    }
  })

  it('coerce numéricos (PORT, RATE_LIMIT_MAX) a partir de strings', async () => {
    vi.stubEnv('PORT', '4242')
    vi.stubEnv('RATE_LIMIT_MAX', '50')
    const mod = await import('./env.js')
    expect(mod.env.PORT).toBe(4242)
    expect(mod.env.RATE_LIMIT_MAX).toBe(50)
  })

  it('aplica defaults para envs opcionais', async () => {
    // Sem setar PORT/HOST/SWAGGER_ROUTE_PREFIX — caem nos defaults
    const mod = await import('./env.js')
    expect(mod.env.HOST).toBe('0.0.0.0')
    expect(mod.env.PORT).toBe(3000)
    expect(mod.env.SWAGGER_ROUTE_PREFIX).toBe('/docs')
  })
})
