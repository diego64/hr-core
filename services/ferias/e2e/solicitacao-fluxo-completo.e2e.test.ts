/**
 * E2E exemplar — exercita o fluxo COMPLETO de uma solicitação de férias
 * pela HTTP API usando `app.inject()` (sem rede), com Mongo real via
 * testcontainers e JWT real assinado por um JWKS local em-memória.
 *
 * Cobre:
 *
 *   - bootstrap via POST /admin/iniciar-periodo (ADMINISTRADOR) — endpoint
 *     temporário enquanto Kafka FuncionarioCriado não está integrado
 *   - 401 sem token, 403 USUARIO em rota ADMIN, 400 body Zod inválido
 *   - happy path: ADMIN inicia período → USUARIO solicita → COORDENADOR aprova
 *   - 409 ao tentar aprovar solicitação que já foi aprovada
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
  title: string
  status: number
  detail?: string
  traceId?: string
}

interface SolicitacaoResponse {
  data: { id: string; codigo: string; status: string; diasSolicitados: number }
}

interface PeriodoAquisitivoResponse {
  data: { id: string; codigoFun: string; saldoDias: number; status: string }
}

function asJson<T>(res: InjectResponse): T {
  return res.json<T>()
}

const FUNCIONARIO_ID = '00000000-0000-0000-0000-000000000abc'
// CPF público de teste com dígitos verificadores válidos
const CPF = '52998224725'

// Data 1 ano e 2 meses atrás — garante período aquisitivo já maduro (saldo cheio).
function umAnoEDoisMesesAtras(): Date {
  const d = new Date()
  d.setFullYear(d.getFullYear() - 1)
  d.setMonth(d.getMonth() - 2)
  return d
}

// Próxima data válida pra início de gozo CLT: ≥30 dias de antecedência, e
// nunca véspera de domingo/feriado. Vamos pegar +45 dias e ajustar para
// segunda-feira mais próxima se cair em sex/sáb/dom.
function proximaDataValida(): { dataInicio: Date; dataFim: Date } {
  const d = new Date()
  d.setDate(d.getDate() + 45)
  d.setUTCHours(0, 0, 0, 0)
  // Ajusta pra segunda se cair em sexta(5)/sábado(6)/domingo(0)
  const day = d.getUTCDay()
  if (day === 0) d.setUTCDate(d.getUTCDate() + 1)
  else if (day === 5) d.setUTCDate(d.getUTCDate() + 3)
  else if (day === 6) d.setUTCDate(d.getUTCDate() + 2)
  const fim = new Date(d)
  fim.setUTCDate(fim.getUTCDate() + 13) // 14 dias corridos inclusivo
  fim.setUTCHours(23, 59, 59, 0)
  return { dataInicio: d, dataFim: fim }
}

describe('E2E — fluxo completo da solicitação de férias', () => {
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

  // ─── auth / authz ────────────────────────────────────────────────────
  it('POST /admin/iniciar-periodo sem token → 401 RFC 7807', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/admin/iniciar-periodo',
      payload: { funcionarioId: FUNCIONARIO_ID, cpf: CPF, dataInicio: new Date().toISOString() },
    })
    expect(res.statusCode).toBe(401)
    const body = asJson<ProblemBody>(res)
    expect(body.type).toBe('https://hr-core/errors/unauthorized')
    expect(body.traceId).toBeTruthy()
  })

  it('POST /admin/iniciar-periodo com role USUARIO → 403', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/admin/iniciar-periodo',
      headers: { Authorization: `Bearer ${userToken}` },
      payload: { funcionarioId: FUNCIONARIO_ID, cpf: CPF, dataInicio: new Date().toISOString() },
    })
    expect(res.statusCode).toBe(403)
  })

  it('POST /admin/iniciar-periodo com body inválido → 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/admin/iniciar-periodo',
      headers: { Authorization: `Bearer ${adminToken}` },
      payload: { funcionarioId: '', cpf: '12', dataInicio: 'foo' },
    })
    expect(res.statusCode).toBe(400)
  })

  // ─── workflow completo ──────────────────────────────────────────────
  it('fluxo: ADMIN inicia período → USUARIO solicita → COORD aprova', async () => {
    // 1) ADMIN inicia período aquisitivo (1+ ano atrás)
    const iniciar = await app.inject({
      method: 'POST',
      url: '/admin/iniciar-periodo',
      headers: { Authorization: `Bearer ${adminToken}` },
      payload: {
        funcionarioId: FUNCIONARIO_ID,
        cpf: CPF,
        dataInicio: umAnoEDoisMesesAtras().toISOString(),
      },
    })
    expect(iniciar.statusCode).toBe(201)
    const periodo = asJson<PeriodoAquisitivoResponse>(iniciar).data
    expect(periodo.saldoDias).toBe(30)

    // 2) USUARIO solicita férias (14 dias com antecedência ≥30d e não-véspera)
    const { dataInicio, dataFim } = proximaDataValida()
    const solicitar = await app.inject({
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
    expect(solicitar.statusCode).toBe(201)
    const sol = asJson<SolicitacaoResponse>(solicitar).data
    expect(sol.codigo).toMatch(/^FER\d+$/)
    expect(sol.status).toBe('PENDENTE')
    expect(sol.diasSolicitados).toBe(14)
    expect(events.byType('FeriasSolicitadas')).toHaveLength(1)

    // 3) COORDENADOR aprova
    const aprov = await app.inject({
      method: 'POST',
      url: `/solicitacoes/${sol.id}/aprovar`,
      headers: { Authorization: `Bearer ${coordToken}` },
      payload: { salarioBruto: 4000 },
    })
    expect(aprov.statusCode).toBe(200)
    expect(asJson<SolicitacaoResponse>(aprov).data.status).toBe('APROVADA')
    expect(events.byType('FeriasAprovadas')).toHaveLength(1)

    // 4) Segunda tentativa de aprovação → 409 solicitacao-nao-pendente
    const segunda = await app.inject({
      method: 'POST',
      url: `/solicitacoes/${sol.id}/aprovar`,
      headers: { Authorization: `Bearer ${coordToken}` },
      payload: { salarioBruto: 4000 },
    })
    expect(segunda.statusCode).toBe(409)
    expect(asJson<ProblemBody>(segunda).type).toMatch(/solicitacao-nao-pendente/)
  })

  it('GET /health → 200 sem auth', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' })
    expect(res.statusCode).toBe(200)
    expect(asJson<{ status: string; service: string }>(res)).toMatchObject({
      status: 'ok',
      service: 'ferias',
    })
  })
})
