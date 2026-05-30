/**
 * E2E exemplar — consultas de período aquisitivo (vigente + histórico).
 *
 * Endpoints cobertos:
 *
 *   - GET /funcionarios/:funcionarioId/periodo-aquisitivo (vigente)
 *   - GET /funcionarios/:funcionarioId/periodos-aquisitivos (histórico)
 *
 * Comando: `pnpm --filter @hr-core/ferias test:integration`
 */
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { InMemoryEventPublisher } from '../test/in-memory-event-publisher.js'
import { startJwtHarness, type JwtHarness } from '../test/jwt-harness.js'
import { startMongoHarness, type MongoHarness } from '../test/mongo-harness.js'

type InjectResponse = Awaited<ReturnType<FastifyInstance['inject']>>

interface ProblemBody {
  type: string
}

interface PeriodoAquisitivoPublic {
  id: string
  codigoFun: string
  status: string
  saldoDias: number
  diasDevidos: number
  diasGozados: number
}

interface PeriodoAquisitivoResponse {
  data: PeriodoAquisitivoPublic
}

interface PeriodosAquisitivosListResponse {
  data: PeriodoAquisitivoPublic[]
}

function asJson<T>(res: InjectResponse): T {
  return res.json<T>()
}

const FUNCIONARIO_ID = '00000000-0000-0000-0000-000000000abc'
const CPF = '52998224725'

function umAnoEDoisMesesAtras(): Date {
  const d = new Date()
  d.setFullYear(d.getFullYear() - 1)
  d.setMonth(d.getMonth() - 2)
  return d
}

describe('E2E — consultas de período aquisitivo', () => {
  let mongo: MongoHarness
  let jwt: JwtHarness
  let events: InMemoryEventPublisher
  let app: FastifyInstance
  let userToken: string
  let adminToken: string

  beforeAll(async () => {
    mongo = await startMongoHarness()
    jwt = await startJwtHarness()

    process.env.MONGO_URL = mongo.uri
    process.env.MONGO_DB_NAME = 'hr-ferias-test'
    process.env.AUTH_JWKS_URL = jwt.jwksUrl
    process.env.AUTH_JWT_ISSUER = jwt.issuer
    process.env.AUTH_JWT_AUDIENCE = jwt.audience

    const { buildApp } = await import('../src/app.js')
    events = new InMemoryEventPublisher()
    app = await buildApp({ db: mongo.db, events })

    userToken = await jwt.sign(FUNCIONARIO_ID, ['USUARIO'])
    adminToken = await jwt.sign('admin-1', ['ADMINISTRADOR'])
  }, 90_000)

  afterAll(async () => {
    await app.close()
    await jwt.stop()
    await mongo.stop()
  })

  beforeEach(async () => {
    await mongo.reset()
    events.reset()
  })

  async function iniciarPeriodo(): Promise<void> {
    await app.inject({
      method: 'POST',
      url: '/admin/iniciar-periodo',
      headers: { Authorization: `Bearer ${adminToken}` },
      payload: {
        funcionarioId: FUNCIONARIO_ID,
        cpf: CPF,
        dataInicio: umAnoEDoisMesesAtras().toISOString(),
      },
    })
  }

  // ─── GET vigente ────────────────────────────────────────────────────
  describe('GET /funcionarios/:fid/periodo-aquisitivo (vigente)', () => {
    it('sem token → 401', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/funcionarios/${FUNCIONARIO_ID}/periodo-aquisitivo`,
      })
      expect(res.statusCode).toBe(401)
      expect(asJson<ProblemBody>(res).type).toBe('https://hr-core/errors/unauthorized')
    })

    it('funcionário sem período aquisitivo → 404 RFC 7807', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/funcionarios/${FUNCIONARIO_ID}/periodo-aquisitivo`,
        headers: { Authorization: `Bearer ${userToken}` },
      })
      expect(res.statusCode).toBe(404)
      expect(asJson<ProblemBody>(res).type).toMatch(/periodo-aquisitivo-nao-encontrado/)
    })

    it('retorna o período DISPONIVEL após iniciar', async () => {
      await iniciarPeriodo()
      const res = await app.inject({
        method: 'GET',
        url: `/funcionarios/${FUNCIONARIO_ID}/periodo-aquisitivo`,
        headers: { Authorization: `Bearer ${userToken}` },
      })
      expect(res.statusCode).toBe(200)
      const p = asJson<PeriodoAquisitivoResponse>(res).data
      expect(p.status).toBe('DISPONIVEL')
      expect(p.diasDevidos).toBe(30)
      expect(p.saldoDias).toBe(30)
    })

    it('USUARIO, COORD e ADMIN acessam o endpoint (3 roles autorizadas)', async () => {
      await iniciarPeriodo()
      const coordToken = await jwt.sign('coord-1', ['COORDENADOR'])

      for (const token of [userToken, coordToken, adminToken]) {
        const res = await app.inject({
          method: 'GET',
          url: `/funcionarios/${FUNCIONARIO_ID}/periodo-aquisitivo`,
          headers: { Authorization: `Bearer ${token}` },
        })
        expect(res.statusCode).toBe(200)
      }
    })
  })

  // ─── GET histórico ──────────────────────────────────────────────────
  describe('GET /funcionarios/:fid/periodos-aquisitivos (histórico)', () => {
    it('retorna lista vazia para funcionário sem períodos', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/funcionarios/${FUNCIONARIO_ID}/periodos-aquisitivos`,
        headers: { Authorization: `Bearer ${userToken}` },
      })
      expect(res.statusCode).toBe(200)
      expect(asJson<PeriodosAquisitivosListResponse>(res).data).toEqual([])
    })

    it('retorna histórico com 1 período após iniciar', async () => {
      await iniciarPeriodo()
      const res = await app.inject({
        method: 'GET',
        url: `/funcionarios/${FUNCIONARIO_ID}/periodos-aquisitivos`,
        headers: { Authorization: `Bearer ${userToken}` },
      })
      expect(res.statusCode).toBe(200)
      const list = asJson<PeriodosAquisitivosListResponse>(res).data
      expect(list).toHaveLength(1)
      expect(list[0]!.codigoFun).toBe('FUN52998224725')
    })

    it('sem token → 401', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/funcionarios/${FUNCIONARIO_ID}/periodos-aquisitivos`,
      })
      expect(res.statusCode).toBe(401)
    })
  })
})
