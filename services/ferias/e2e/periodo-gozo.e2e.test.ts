/**
 * E2E exemplar — endpoints de período de gozo.
 *
 * Endpoints cobertos:
 *
 *   - GET /funcionarios/:funcionarioId/periodos-gozo
 *   - GET /periodos-gozo/:id
 *
 * Setup: aproveitamos o fluxo real — ADMIN inicia período aquisitivo →
 * USUARIO cria solicitação → COORD aprova (cria o PeriodoGozo).
 *
 * Comando: `pnpm --filter @hr-core/ferias test:integration`
 */
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { InMemoryEventPublisher } from '../test/in-memory-event-publisher.js'
import { startJwtHarness, type JwtHarness } from '../test/jwt-harness.js'
import { startMongoHarness, type MongoHarness } from '../test/mongo-harness.js'

type InjectResponse = Awaited<ReturnType<FastifyInstance['inject']>>

interface PeriodoGozoPublic {
  id: string
  funcionarioId: string
  status: string
  diasGozo: number
  valorFerias: number
  valorTerco: number
  valorTotal: number
}

interface PeriodoGozoResponse {
  data: PeriodoGozoPublic
}

interface PeriodosGozoListResponse {
  data: PeriodoGozoPublic[]
}

interface SolicitacaoResponse {
  data: { id: string }
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

function proximaDataValida(): { dataInicio: Date; dataFim: Date } {
  const d = new Date()
  d.setDate(d.getDate() + 45)
  d.setUTCHours(0, 0, 0, 0)
  const day = d.getUTCDay()
  if (day === 0) d.setUTCDate(d.getUTCDate() + 1)
  else if (day === 5) d.setUTCDate(d.getUTCDate() + 3)
  else if (day === 6) d.setUTCDate(d.getUTCDate() + 2)
  const fim = new Date(d)
  fim.setUTCDate(fim.getUTCDate() + 13)
  fim.setUTCHours(23, 59, 59, 0)
  return { dataInicio: d, dataFim: fim }
}

describe('E2E — período de gozo (leitura)', () => {
  let mongo: MongoHarness
  let jwt: JwtHarness
  let events: InMemoryEventPublisher
  let app: FastifyInstance
  let userToken: string
  let coordToken: string
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
    coordToken = await jwt.sign('coord-1', ['COORDENADOR'])
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

  /**
   * Fluxo real: inicia período → solicita → aprova → retorna o gozoId.
   * Aprovar cria o PeriodoGozo no service.
   */
  async function criarGozo(): Promise<{ solicitacaoId: string }> {
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

    const { dataInicio, dataFim } = proximaDataValida()
    const criar = await app.inject({
      method: 'POST',
      url: `/funcionarios/${FUNCIONARIO_ID}/solicitacoes`,
      headers: { Authorization: `Bearer ${userToken}` },
      payload: {
        dataInicio: dataInicio.toISOString(),
        dataFim: dataFim.toISOString(),
        abonoPecuniario: false,
        diasAbono: 0,
      },
    })
    const solicitacaoId = asJson<SolicitacaoResponse>(criar).data.id

    await app.inject({
      method: 'POST',
      url: `/solicitacoes/${solicitacaoId}/aprovar`,
      headers: { Authorization: `Bearer ${coordToken}` },
      payload: { salarioBruto: 4000 },
    })

    return { solicitacaoId }
  }

  // ─── lista por funcionário ──────────────────────────────────────────
  describe('GET /funcionarios/:fid/periodos-gozo', () => {
    it('sem token → 401', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/funcionarios/${FUNCIONARIO_ID}/periodos-gozo`,
      })
      expect(res.statusCode).toBe(401)
    })

    it('lista vazia se ainda não aprovou nada', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/funcionarios/${FUNCIONARIO_ID}/periodos-gozo`,
        headers: { Authorization: `Bearer ${userToken}` },
      })
      expect(res.statusCode).toBe(200)
      expect(asJson<PeriodosGozoListResponse>(res).data).toEqual([])
    })

    it('retorna gozo AGENDADO após aprovação da solicitação', async () => {
      await criarGozo()

      const res = await app.inject({
        method: 'GET',
        url: `/funcionarios/${FUNCIONARIO_ID}/periodos-gozo`,
        headers: { Authorization: `Bearer ${userToken}` },
      })
      expect(res.statusCode).toBe(200)
      const list = asJson<PeriodosGozoListResponse>(res).data
      expect(list).toHaveLength(1)
      expect(list[0]!.status).toBe('AGENDADO')
      expect(list[0]!.diasGozo).toBe(14)
      // (4000 / 30) * 14 = 1866.67 + terço (622.22) ≈ valorTotal ≈ 2488.89
      expect(list[0]!.valorFerias).toBeCloseTo(1866.67, 2)
      expect(list[0]!.valorTerco).toBeCloseTo(622.22, 2)
    })

    it('todas as 3 roles acessam o endpoint', async () => {
      await criarGozo()
      for (const token of [userToken, coordToken, adminToken]) {
        const res = await app.inject({
          method: 'GET',
          url: `/funcionarios/${FUNCIONARIO_ID}/periodos-gozo`,
          headers: { Authorization: `Bearer ${token}` },
        })
        expect(res.statusCode).toBe(200)
      }
    })
  })

  // ─── busca por id ───────────────────────────────────────────────────
  describe('GET /periodos-gozo/:id', () => {
    it('retorna gozo existente', async () => {
      await criarGozo()
      const listRes = await app.inject({
        method: 'GET',
        url: `/funcionarios/${FUNCIONARIO_ID}/periodos-gozo`,
        headers: { Authorization: `Bearer ${userToken}` },
      })
      const gozoId = asJson<PeriodosGozoListResponse>(listRes).data[0]!.id

      const res = await app.inject({
        method: 'GET',
        url: `/periodos-gozo/${gozoId}`,
        headers: { Authorization: `Bearer ${userToken}` },
      })
      expect(res.statusCode).toBe(200)
      expect(asJson<PeriodoGozoResponse>(res).data.id).toBe(gozoId)
    })

    it('id inexistente → 404', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/periodos-gozo/507f1f77bcf86cd799439011',
        headers: { Authorization: `Bearer ${userToken}` },
      })
      expect(res.statusCode).toBe(404)
    })

    it('sem token → 401', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/periodos-gozo/507f1f77bcf86cd799439011',
      })
      expect(res.statusCode).toBe(401)
    })
  })
})
