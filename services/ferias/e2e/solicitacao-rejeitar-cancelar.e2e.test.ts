/**
 * E2E exemplar — endpoints de rejeição, cancelamento e leitura de
 * solicitações, complementando `solicitacao-fluxo-completo.e2e.test.ts`
 * (que cobre apenas criar + aprovar).
 *
 * Endpoints cobertos aqui:
 *
 *   - POST /solicitacoes/:id/rejeitar    (COORD/ADMIN; body justificativa)
 *   - POST /solicitacoes/:id/cancelar    (USUARIO própria/PENDENTE | ADMIN any)
 *   - GET  /solicitacoes                 (COORD/ADMIN — lista global)
 *   - GET  /solicitacoes/:id             (autenticado)
 *   - GET  /funcionarios/:fid/solicitacoes (autenticado)
 *
 * Comando: `pnpm --filter @hr-core/ferias test:integration`
 */
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { InMemoryEventPublisher } from '../test/in-memory-event-publisher.js'
import { startJwtHarness, type JwtHarness } from '../test/jwt-harness.js'
import { startMongoHarness, type MongoHarness } from '../test/mongo-harness.js'

type InjectResponse = Awaited<ReturnType<FastifyInstance['inject']>>

interface SolicitacaoPublic {
  id: string
  codigo: string
  status: string
  justificativaRejeicao?: string | null
  motivoCancelamento?: string | null
}

interface SolicitacaoResponse {
  data: SolicitacaoPublic
}

interface SolicitacoesListResponse {
  data: SolicitacaoPublic[]
  meta: { total: number; page: number; limit: number; pages: number }
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

describe('E2E — solicitação rejeitar/cancelar/listar', () => {
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
   * Inicia o período aquisitivo via ADMIN e cria uma solicitação PENDENTE
   * via USUARIO. Retorna o id da solicitação.
   */
  async function criarSolicitacaoPendente(): Promise<string> {
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
    const res = await app.inject({
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
    return asJson<SolicitacaoResponse>(res).data.id
  }

  // ─── /solicitacoes/:id/rejeitar ─────────────────────────────────────
  describe('POST /solicitacoes/:id/rejeitar', () => {
    it('USUARIO → 403 (precisa COORD/ADMIN)', async () => {
      const id = await criarSolicitacaoPendente()
      const res = await app.inject({
        method: 'POST',
        url: `/solicitacoes/${id}/rejeitar`,
        headers: { Authorization: `Bearer ${userToken}` },
        payload: { justificativa: 'Falta antecedência' },
      })
      expect(res.statusCode).toBe(403)
    })

    it('justificativa curta → 400 Zod', async () => {
      const id = await criarSolicitacaoPendente()
      const res = await app.inject({
        method: 'POST',
        url: `/solicitacoes/${id}/rejeitar`,
        headers: { Authorization: `Bearer ${coordToken}` },
        payload: { justificativa: 'oi' }, // < 3 chars
      })
      expect(res.statusCode).toBe(400)
    })

    it('rejeita PENDENTE com justificativa válida e publica FeriasRejeitadas', async () => {
      const id = await criarSolicitacaoPendente()
      const res = await app.inject({
        method: 'POST',
        url: `/solicitacoes/${id}/rejeitar`,
        headers: { Authorization: `Bearer ${coordToken}` },
        payload: { justificativa: 'Antecedência insuficiente para o setor' },
      })
      expect(res.statusCode).toBe(200)
      const sol = asJson<SolicitacaoResponse>(res).data
      expect(sol.status).toBe('REJEITADA')
      expect(sol.justificativaRejeicao).toBe('Antecedência insuficiente para o setor')
      expect(events.byType('FeriasRejeitadas')).toHaveLength(1)
    })

    it('rejeitar duas vezes a mesma solicitação → 409', async () => {
      const id = await criarSolicitacaoPendente()
      await app.inject({
        method: 'POST',
        url: `/solicitacoes/${id}/rejeitar`,
        headers: { Authorization: `Bearer ${coordToken}` },
        payload: { justificativa: 'primeira rejeição' },
      })
      const segunda = await app.inject({
        method: 'POST',
        url: `/solicitacoes/${id}/rejeitar`,
        headers: { Authorization: `Bearer ${coordToken}` },
        payload: { justificativa: 'segunda tentativa' },
      })
      expect(segunda.statusCode).toBe(409)
    })
  })

  // ─── /solicitacoes/:id/cancelar ─────────────────────────────────────
  describe('POST /solicitacoes/:id/cancelar', () => {
    it('USUARIO cancela a própria solicitação PENDENTE', async () => {
      const id = await criarSolicitacaoPendente()
      const res = await app.inject({
        method: 'POST',
        url: `/solicitacoes/${id}/cancelar`,
        headers: { Authorization: `Bearer ${userToken}` },
        payload: { motivo: 'mudança de planos pessoais' },
      })
      expect(res.statusCode).toBe(200)
      const sol = asJson<SolicitacaoResponse>(res).data
      expect(sol.status).toBe('CANCELADA')
      expect(sol.motivoCancelamento).toBe('mudança de planos pessoais')
      expect(events.byType('FeriasCanceladas')).toHaveLength(1)
    })

    it('motivo curto → 400 Zod', async () => {
      const id = await criarSolicitacaoPendente()
      const res = await app.inject({
        method: 'POST',
        url: `/solicitacoes/${id}/cancelar`,
        headers: { Authorization: `Bearer ${userToken}` },
        payload: { motivo: 'x' },
      })
      expect(res.statusCode).toBe(400)
    })

    it('COORDENADOR → 403 (requer USUARIO ou ADMIN)', async () => {
      const id = await criarSolicitacaoPendente()
      const res = await app.inject({
        method: 'POST',
        url: `/solicitacoes/${id}/cancelar`,
        headers: { Authorization: `Bearer ${coordToken}` },
        payload: { motivo: 'tentativa do coord' },
      })
      expect(res.statusCode).toBe(403)
    })

    it('ADMIN cancela solicitação APROVADA', async () => {
      const id = await criarSolicitacaoPendente()
      // Aprova primeiro
      await app.inject({
        method: 'POST',
        url: `/solicitacoes/${id}/aprovar`,
        headers: { Authorization: `Bearer ${coordToken}` },
        payload: { salarioBruto: 4000 },
      })

      const res = await app.inject({
        method: 'POST',
        url: `/solicitacoes/${id}/cancelar`,
        headers: { Authorization: `Bearer ${adminToken}` },
        payload: { motivo: 'erro operacional do coordenador' },
      })
      expect(res.statusCode).toBe(200)
      expect(asJson<SolicitacaoResponse>(res).data.status).toBe('CANCELADA')
    })
  })

  // ─── /solicitacoes (leitura) ────────────────────────────────────────
  describe('GET /solicitacoes (listas)', () => {
    it('GET /solicitacoes como USUARIO → 403', async () => {
      await criarSolicitacaoPendente()
      const res = await app.inject({
        method: 'GET',
        url: '/solicitacoes',
        headers: { Authorization: `Bearer ${userToken}` },
      })
      expect(res.statusCode).toBe(403)
    })

    it('GET /solicitacoes COORD retorna lista paginada', async () => {
      await criarSolicitacaoPendente()
      const res = await app.inject({
        method: 'GET',
        url: '/solicitacoes?page=1&limit=20',
        headers: { Authorization: `Bearer ${coordToken}` },
      })
      expect(res.statusCode).toBe(200)
      const list = asJson<SolicitacoesListResponse>(res)
      expect(list.meta.total).toBe(1)
      expect(list.data[0]!.status).toBe('PENDENTE')
    })

    it('GET /solicitacoes filtra por status', async () => {
      const id1 = await criarSolicitacaoPendente()
      // Aprova a primeira
      await app.inject({
        method: 'POST',
        url: `/solicitacoes/${id1}/aprovar`,
        headers: { Authorization: `Bearer ${coordToken}` },
        payload: { salarioBruto: 4000 },
      })

      const aprovadas = await app.inject({
        method: 'GET',
        url: '/solicitacoes?status=APROVADA',
        headers: { Authorization: `Bearer ${coordToken}` },
      })
      expect(aprovadas.statusCode).toBe(200)
      expect(asJson<SolicitacoesListResponse>(aprovadas).meta.total).toBe(1)

      const pendentes = await app.inject({
        method: 'GET',
        url: '/solicitacoes?status=PENDENTE',
        headers: { Authorization: `Bearer ${coordToken}` },
      })
      expect(asJson<SolicitacoesListResponse>(pendentes).meta.total).toBe(0)
    })

    it('GET /solicitacoes/:id retorna detalhe', async () => {
      const id = await criarSolicitacaoPendente()
      const res = await app.inject({
        method: 'GET',
        url: `/solicitacoes/${id}`,
        headers: { Authorization: `Bearer ${userToken}` },
      })
      expect(res.statusCode).toBe(200)
      expect(asJson<SolicitacaoResponse>(res).data.id).toBe(id)
    })

    it('GET /solicitacoes/:id inexistente → 404', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/solicitacoes/507f1f77bcf86cd799439011',
        headers: { Authorization: `Bearer ${userToken}` },
      })
      expect(res.statusCode).toBe(404)
    })

    it('GET /funcionarios/:fid/solicitacoes lista histórico do funcionário', async () => {
      await criarSolicitacaoPendente()
      const res = await app.inject({
        method: 'GET',
        url: `/funcionarios/${FUNCIONARIO_ID}/solicitacoes?page=1&limit=20`,
        headers: { Authorization: `Bearer ${userToken}` },
      })
      expect(res.statusCode).toBe(200)
      const list = asJson<SolicitacoesListResponse>(res)
      expect(list.meta.total).toBe(1)
    })
  })
})
