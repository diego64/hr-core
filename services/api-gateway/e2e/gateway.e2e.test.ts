import { describe, expect, it } from 'vitest'

const BASE_URL = process.env.E2E_BASE_URL ?? 'http://localhost:3000'

async function get(path: string, init?: RequestInit): Promise<Response> {
  return fetch(`${BASE_URL}${path}`, init)
}

describe('api-gateway · E2E', () => {
  describe('health & readiness', () => {
    it('GET /health responds 200 with service=api-gateway', async () => {
      const res = await get('/health')
      expect(res.status).toBe(200)
      const body = (await res.json()) as Record<string, unknown>
      expect(body.status).toBe('ok')
      expect(body.service).toBe('api-gateway')
      expect(typeof body.timestamp).toBe('string')
    })

    it('GET /ready responds 200', async () => {
      const res = await get('/ready')
      expect(res.status).toBe(200)
      const body = (await res.json()) as Record<string, unknown>
      expect(body.status).toBe('ready')
    })
  })

  describe('metrics', () => {
    it('GET /metrics returns Prometheus text exposition', async () => {
      // primeiro warm-up para gerar amostras de duração de rota
      await get('/health')
      await get('/health')

      const res = await get('/metrics')
      expect(res.status).toBe(200)
      expect(res.headers.get('content-type') ?? '').toContain('text/plain')
      const body = await res.text()
      expect(body).toContain('http_request_duration_seconds')
      expect(body).toContain('nodejs_eventloop_lag_seconds')
    })
  })

  describe('error contract (RFC 7807)', () => {
    it('GET unknown route → 404 application/problem+json with traceId', async () => {
      const res = await get('/api/v1/this-route-does-not-exist')
      expect(res.status).toBe(404)
      expect(res.headers.get('content-type') ?? '').toContain('application/problem+json')
      const body = (await res.json()) as Record<string, unknown>
      expect(body.status).toBe(404)
      expect(body.title).toBe('Not Found')
      expect(body.type).toContain('not-found')
      expect(typeof body.traceId).toBe('string')
    })
  })

  describe('authentication on protected routes', () => {
    it('GET /api/v1/funcionarios without token → 401', async () => {
      const res = await get('/api/v1/funcionarios')
      expect(res.status).toBe(401)
      const body = (await res.json()) as Record<string, unknown>
      expect(body.status).toBe(401)
      expect(body.type).toContain('unauthorized')
    })

    it('GET /api/v1/funcionarios with malformed Authorization → 401', async () => {
      const res = await get('/api/v1/funcionarios', {
        headers: { Authorization: 'Basic abc' },
      })
      expect(res.status).toBe(401)
    })

    it('GET /api/v1/funcionarios with invalid Bearer → 401', async () => {
      const res = await get('/api/v1/funcionarios', {
        headers: { Authorization: 'Bearer not.a.valid.jwt' },
      })
      expect(res.status).toBe(401)
    })
  })

  describe('CORS', () => {
    it('preflight from allowed origin echoes the origin', async () => {
      const res = await get('/health', {
        method: 'OPTIONS',
        headers: {
          Origin: 'http://localhost:5173',
          'Access-Control-Request-Method': 'GET',
        },
      })
      expect(res.headers.get('access-control-allow-origin')).toBe('http://localhost:5173')
      expect(res.headers.get('access-control-allow-credentials')).toBe('true')
    })

    it('preflight from unknown origin does not echo it', async () => {
      const res = await get('/health', {
        method: 'OPTIONS',
        headers: {
          Origin: 'http://attacker.test',
          'Access-Control-Request-Method': 'GET',
        },
      })
      expect(res.headers.get('access-control-allow-origin')).toBeNull()
    })
  })

  describe('trace propagation', () => {
    it('echoes incoming X-Trace-Id', async () => {
      const traceId = 'e2e-trace-' + Math.random().toString(36).slice(2, 10)
      const res = await get('/api/v1/this-route-does-not-exist', {
        headers: { 'X-Trace-Id': traceId },
      })
      const body = (await res.json()) as Record<string, unknown>
      expect(body.traceId).toBe(traceId)
    })
  })
})
