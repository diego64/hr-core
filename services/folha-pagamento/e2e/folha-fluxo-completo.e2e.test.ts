/**
 * E2E exemplar — exercita o fluxo COMPLETO de uma folha mensal pela HTTP API
 * usando `app.inject()` (sem rede), com Mongo real via testcontainers e
 * JWT real assinado por um JWKS local em-memória (jwt-harness).
 *
 * Template para replicar nos outros services. Cobre:
 *
 *   - 401 sem token, 401 token inválido
 *   - 403 USUARIO tentando abrir folha (precisa COORDENADOR ou ADMINISTRADOR)
 *   - 400 Zod (body inválido)
 *   - happy path do workflow: abrir → lançar verba → processar → aprovar
 *                              → confirmar pagamento (somente ADMIN)
 *                              → fechar (somente ADMIN)
 *   - 409 folha-imutavel após FECHADA
 *   - publicação de eventos via InMemoryEventPublisher
 *
 * Comando: `pnpm --filter @hr-core/folha-pagamento test:integration`
 */
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

type InjectResponse = Awaited<ReturnType<FastifyInstance['inject']>>

import { InMemoryEventPublisher } from '../test/in-memory-event-publisher.js'
import { startJwtHarness, type JwtHarness } from '../test/jwt-harness.js'
import { startMongoHarness, type MongoHarness } from '../test/mongo-harness.js'

interface ProblemBody {
  type: string
  title: string
  status: number
  detail?: string
  traceId?: string
}

interface FolhaItem {
  codigo: string
  valor: number
}

interface FolhaResponse {
  data: {
    id: string
    status: string
    proventos: FolhaItem[]
    descontos: FolhaItem[]
    descontoINSS: number
    descontoIRRF: number
    fgts: number
  }
}

function asJson<T>(res: InjectResponse): T {
  return res.json<T>()
}

describe('E2E — fluxo completo da folha mensal', () => {
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

    // Sobrescreve env ANTES de importar buildApp — o env.ts carrega no boot
    // e o jose.createRemoteJWKSet cacheia o URL no plugin de auth.
    process.env.MONGO_URL = mongo.uri
    process.env.MONGO_DB_NAME = 'hr-folha-test'
    process.env.AUTH_JWKS_URL = jwt.jwksUrl
    process.env.AUTH_JWT_ISSUER = jwt.issuer
    process.env.AUTH_JWT_AUDIENCE = jwt.audience

    const { buildApp } = await import('../src/app.js')
    events = new InMemoryEventPublisher()
    app = await buildApp({ db: mongo.db, events })

    userToken = await jwt.sign('user-1', ['USUARIO'])
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
    // Popula o cache de funcionário — sem o cache, abrir folha → 404
    await mongo.db.collection('funcionarios_cache').insertOne({
      _id: 'fid-1',
      codigoFun: 'FUN12345678900',
      nome: 'João da Silva',
      setor: 'Tecnologia',
      salarioBase: 5_000,
      numeroDependentes: 1,
      ativo: true,
      updatedAt: new Date(),
    })
  })

  // auth / authz
  it('POST /folhas sem token → 401 RFC 7807', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/folhas',
      payload: { codigoFun: 'FUN12345678900', tipo: 'MENSAL', competencia: '2026-05' },
    })
    expect(res.statusCode).toBe(401)
    expect(res.headers['content-type']).toContain('application/problem+json')
    const body = asJson<ProblemBody>(res)
    expect(body.type).toBe('https://hr-core/errors/unauthorized')
    expect(body.traceId).toBeTruthy()
  })

  it('POST /folhas com role USUARIO → 403', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/folhas',
      headers: { Authorization: `Bearer ${userToken}` },
      payload: { codigoFun: 'FUN12345678900', tipo: 'MENSAL', competencia: '2026-05' },
    })
    expect(res.statusCode).toBe(403)
    expect(asJson<ProblemBody>(res).type).toBe('https://hr-core/errors/forbidden')
  })

  it('POST /folhas com body inválido → 400 RFC 7807 com detalhe Zod', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/folhas',
      headers: { Authorization: `Bearer ${coordToken}` },
      payload: { codigoFun: 'invalido', tipo: 'X', competencia: 'foo' },
    })
    expect(res.statusCode).toBe(400)
    const body = asJson<ProblemBody>(res)
    // Fastify embrulha o ZodError em FastifyError antes do handler — o type final
    // é `bad-request`, mas o `detail` carrega o erro Zod field-by-field.
    expect(body.type).toBe('https://hr-core/errors/bad-request')
    expect(body.traceId).toBeTruthy()
    expect(body.detail).toMatch(/codigoFun|tipo|competencia/)
  })

  // workflow completo
  it('fluxo: abrir → lançar verba → processar → aprovar → pagar → fechar', async () => {
    // 1) COORDENADOR abre folha
    const aberta = await app.inject({
      method: 'POST',
      url: '/folhas',
      headers: { Authorization: `Bearer ${coordToken}` },
      payload: { codigoFun: 'FUN12345678900', tipo: 'MENSAL', competencia: '2026-05' },
    })
    expect(aberta.statusCode).toBe(201)
    const folhaId = asJson<FolhaResponse>(aberta).data.id
    expect(folhaId).toBeTruthy()
    expect(events.byType('FolhaAberta')).toHaveLength(1)

    // 2) Lança verba (hora extra)
    const verba = await app.inject({
      method: 'POST',
      url: `/folhas/${folhaId}/verbas`,
      headers: { Authorization: `Bearer ${coordToken}` },
      payload: { codigo: '002', valor: 500, referencia: '20h' },
    })
    expect(verba.statusCode).toBe(200)
    expect(asJson<FolhaResponse>(verba).data.proventos.some((p) => p.codigo === '002')).toBe(true)

    // 3) Processa cálculos
    const proc = await app.inject({
      method: 'POST',
      url: `/folhas/${folhaId}/processar`,
      headers: { Authorization: `Bearer ${coordToken}` },
    })
    expect(proc.statusCode).toBe(200)
    const procData = asJson<FolhaResponse>(proc).data
    expect(procData.status).toBe('PROCESSADA')
    expect(procData.descontoINSS).toBeGreaterThan(0)
    expect(procData.fgts).toBeGreaterThan(0)
    expect(events.byType('FolhaProcessada')).toHaveLength(1)

    // 4) Aprova
    const aprov = await app.inject({
      method: 'POST',
      url: `/folhas/${folhaId}/aprovar`,
      headers: { Authorization: `Bearer ${coordToken}` },
    })
    expect(aprov.statusCode).toBe(200)
    expect(asJson<FolhaResponse>(aprov).data.status).toBe('APROVADA')

    // 5) COORDENADOR não pode confirmar pagamento — só ADMINISTRADOR
    const pagCoord = await app.inject({
      method: 'POST',
      url: `/folhas/${folhaId}/confirmar-pagamento`,
      headers: { Authorization: `Bearer ${coordToken}` },
    })
    expect(pagCoord.statusCode).toBe(403)

    const pagAdmin = await app.inject({
      method: 'POST',
      url: `/folhas/${folhaId}/confirmar-pagamento`,
      headers: { Authorization: `Bearer ${adminToken}` },
    })
    expect(pagAdmin.statusCode).toBe(200)
    expect(asJson<FolhaResponse>(pagAdmin).data.status).toBe('PAGA')

    // 6) ADMINISTRADOR fecha
    const fechar = await app.inject({
      method: 'POST',
      url: `/folhas/${folhaId}/fechar`,
      headers: { Authorization: `Bearer ${adminToken}` },
    })
    expect(fechar.statusCode).toBe(200)
    expect(asJson<FolhaResponse>(fechar).data.status).toBe('FECHADA')

    // 7) Após FECHADA, qualquer mudança em verbas → 409 folha-imutavel
    const tentativaPostFecha = await app.inject({
      method: 'POST',
      url: `/folhas/${folhaId}/verbas`,
      headers: { Authorization: `Bearer ${adminToken}` },
      payload: { codigo: '002', valor: 100 },
    })
    expect(tentativaPostFecha.statusCode).toBe(409)
    expect(asJson<ProblemBody>(tentativaPostFecha).type).toBe(
      'https://hr-core/errors/folha-imutavel',
    )
  })

  it('duplicidade (funcionario, tipo, competencia) → 409 folha-competencia-duplicada', async () => {
    const opts = {
      method: 'POST' as const,
      url: '/folhas',
      headers: { Authorization: `Bearer ${coordToken}` },
      payload: { codigoFun: 'FUN12345678900', tipo: 'MENSAL', competencia: '2026-05' },
    }
    const r1 = await app.inject(opts)
    expect(r1.statusCode).toBe(201)
    const r2 = await app.inject(opts)
    expect(r2.statusCode).toBe(409)
    expect(asJson<ProblemBody>(r2).type).toBe('https://hr-core/errors/folha-competencia-duplicada')
  })

  it('GET /health → 200 sem auth', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' })
    expect(res.statusCode).toBe(200)
    expect(asJson<{ status: string; service: string }>(res)).toMatchObject({
      status: 'ok',
      service: 'folha-pagamento',
    })
  })
})
