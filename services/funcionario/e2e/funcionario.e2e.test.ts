/**
 * Suite E2E — roda contra a stack do compose:
 *   - funcionario-service em http://localhost:3002 (override via FUNCIONARIO_BASE_URL)
 *   - mongo em mongodb://localhost:27018 (banco hr-funcionarios)
 *
 * Não usa app.inject — fala HTTP de verdade contra o container. Valida:
 *   - endpoints públicos (/health, /metrics, /docs)
 *   - middleware de auth (401 sem token, 401 com token inválido)
 *   - propagação de X-Trace-Id em respostas de erro
 *
 * NÃO valida fluxos autenticados aqui (esses são cobertos pelo app.test.ts
 * de integração, que monta JWKS local). E2E autenticado cruza com o Auth
 * Service real, fora do escopo da V1 mínima.
 */
import { beforeAll, describe, expect, it } from 'vitest'

const BASE = process.env.FUNCIONARIO_BASE_URL ?? 'http://localhost:3002'

async function http(
  method: string,
  path: string,
  body?: unknown,
  headers: Record<string, string> = {},
) {
  const reqHeaders: Record<string, string> = { 'Content-Type': 'application/json', ...headers }
  const res = await fetch(BASE + path, {
    method,
    headers: reqHeaders,
    body: body !== undefined ? JSON.stringify(body) : null,
  })
  const text = await res.text()
  let json: unknown
  try {
    json = text ? JSON.parse(text) : null
  } catch {
    json = null
  }
  return { status: res.status, headers: res.headers, body: json, raw: text }
}

describe('Funcionario E2E (contra compose)', () => {
  beforeAll(async () => {
    const h = await http('GET', '/health')
    if (h.status !== 200) {
      throw new Error(
        `funcionario-service não está respondendo em ${BASE}/health (status=${h.status})`,
      )
    }
  })

  describe('endpoints públicos', () => {
    it('GET /health → 200 com service=funcionario', async () => {
      const r = await http('GET', '/health')
      expect(r.status).toBe(200)
      const b = r.body as { status: string; service: string; timestamp: string }
      expect(b.status).toBe('ok')
      expect(b.service).toBe('funcionario')
    })

    it('GET /metrics → text/plain com http_request_duration_seconds_count', async () => {
      await http('GET', '/health') // garante 1 amostra
      const r = await http('GET', '/metrics')
      expect(r.status).toBe(200)
      expect(r.headers.get('content-type')).toContain('text/plain')
      expect(r.raw).toContain('http_request_duration_seconds_count')
    })

    it('GET /docs/json → spec OpenAPI 3.x com paths registrados (funcionarios/documentos/aprovacoes)', async () => {
      const r = await http('GET', '/docs/json')
      expect(r.status).toBe(200)
      const spec = r.body as { openapi: string; paths: Record<string, unknown> }
      expect(spec.openapi).toMatch(/^3\./)
      expect(spec.paths).toHaveProperty('/funcionarios/')
      expect(spec.paths).toHaveProperty('/funcionarios/{id}/documentos')
      expect(spec.paths).toHaveProperty('/documentos/{id}/aprovar')
      expect(spec.paths).toHaveProperty('/aprovacoes')
    })
  })

  describe('middleware de auth', () => {
    it('POST /funcionarios sem Authorization → 401', async () => {
      const r = await http('POST', '/funcionarios', {
        nome: 'X',
        cpf: '111.444.777-35',
        email: 'e2e@x.com',
        telefone: '11999999999',
        cargo: 'Dev',
        departamento: 'Tech',
      })
      expect(r.status).toBe(401)
    })

    it('GET /funcionarios com Bearer inválido → 401', async () => {
      const r = await http('GET', '/funcionarios', undefined, {
        authorization: 'Bearer token-invalido',
      })
      expect(r.status).toBe(401)
    })

    it('GET /funcionarios/:id sem Authorization → 401', async () => {
      const r = await http('GET', '/funcionarios/000000000000000000000000')
      expect(r.status).toBe(401)
    })

    it('DELETE /funcionarios/:id sem Authorization → 401', async () => {
      const r = await http('DELETE', '/funcionarios/000000000000000000000000')
      expect(r.status).toBe(401)
    })

    it('GET /funcionarios/:id/documentos sem Authorization → 401', async () => {
      const r = await http('GET', '/funcionarios/000000000000000000000000/documentos')
      expect(r.status).toBe(401)
    })

    it('POST /documentos/:id/aprovar sem Authorization → 401', async () => {
      const r = await http('POST', '/documentos/000000000000000000000000/aprovar', {})
      expect(r.status).toBe(401)
    })

    it('POST /documentos/:id/rejeitar sem Authorization → 401', async () => {
      const r = await http('POST', '/documentos/000000000000000000000000/rejeitar', {
        motivo: 'x',
      })
      expect(r.status).toBe(401)
    })

    it('PATCH /funcionarios/:id sem Authorization → 401', async () => {
      const r = await http('PATCH', '/funcionarios/000000000000000000000000', {
        cargo: 'X',
      })
      expect(r.status).toBe(401)
    })

    it('GET /aprovacoes sem Authorization → 401', async () => {
      const r = await http('GET', '/aprovacoes')
      expect(r.status).toBe(401)
    })

    it('POST /aprovacoes/:id/aprovar sem Authorization → 401', async () => {
      const r = await http('POST', '/aprovacoes/000000000000000000000000/aprovar', {})
      expect(r.status).toBe(401)
    })
  })

  describe('traceId propagation', () => {
    it('honra X-Trace-Id do cliente em respostas de erro', async () => {
      const traceId = '7d7d7d7d-7d7d-7d7d-7d7d-7d7d7d7d7d7d'
      const r = await http('GET', '/rota-inexistente', undefined, { 'x-trace-id': traceId })
      expect(r.status).toBe(404)
      const b = r.body as { traceId: string }
      expect(b.traceId).toBe(traceId)
    })
  })
})
