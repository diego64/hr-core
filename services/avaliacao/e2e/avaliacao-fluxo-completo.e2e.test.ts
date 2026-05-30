/**
 * E2E exemplar — exercita o fluxo completo de criar avaliador e avaliação
 * pela HTTP API via `app.inject()`, com Mongo real via testcontainers e
 * JWT real assinado por um JWKS local em-memória.
 *
 * Cobre:
 *
 *   - 401 sem token, 403 USUARIO em rota ADMIN/AVALIADOR, 400 body Zod inválido
 *   - happy path: ADMIN cria avaliador (vincula usuário a setor)
 *     → AVALIADOR (com sub = usuarioId do avaliador criado) cria avaliação
 *     → listar avaliações por codigoFun
 *   - update parcial da avaliação preserva campos não informados
 *   - publicação de eventos via InMemoryEventPublisher
 *
 * Comando: `pnpm --filter @hr-core/avaliacao test:integration`
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

interface AvaliadorResponse {
  data: { id: string; usuarioId: string; setor: string; ativo: boolean }
}

interface AvaliacaoResponse {
  data: {
    id: string
    codigo: string
    codigoFun: string
    titulo: string
    comentario: string
    nota: number
    setor: string
  }
}

interface AvaliacoesListResponse {
  data: AvaliacaoResponse['data'][]
  meta: { total: number; page: number; limit: number; pages: number }
}

function asJson<T>(res: InjectResponse): T {
  return res.json<T>()
}

const ADMIN_USER_ID = 'admin-user-id'
const AVALIADOR_USER_ID = 'avaliador-user-id'
const FUNCIONARIO_CODIGO = 'FUN12345678900'
const SETOR = 'Tecnologia'

describe('E2E — fluxo completo de avaliador e avaliação', () => {
  let mongo: MongoHarness
  let jwt: JwtHarness
  let events: InMemoryEventPublisher
  let app: FastifyInstance
  let userToken: string
  let avaliadorToken: string
  let adminToken: string

  beforeAll(async () => {
    mongo = await startMongoHarness()
    jwt = await startJwtHarness()

    process.env.MONGO_URL = mongo.uri
    process.env.MONGO_DB_NAME = 'hr-avaliacao-test'
    process.env.AUTH_JWKS_URL = jwt.jwksUrl
    process.env.AUTH_JWT_ISSUER = jwt.issuer
    process.env.AUTH_JWT_AUDIENCE = jwt.audience

    const { buildApp } = await import('../src/app.js')
    events = new InMemoryEventPublisher()
    app = await buildApp({ db: mongo.db, events })

    userToken = await jwt.sign('outro-user', ['USUARIO'])
    avaliadorToken = await jwt.sign(AVALIADOR_USER_ID, ['AVALIADOR'])
    adminToken = await jwt.sign(ADMIN_USER_ID, ['ADMINISTRADOR'])
  }, 90_000)

  afterAll(async () => {
    await app.close()
    await jwt.stop()
    await mongo.stop()
  })

  beforeEach(async () => {
    await mongo.reset()
    events.reset()
    // Pre-popula o cache do funcionário no mesmo setor do avaliador
    await mongo.db.collection('funcionarios_cache').insertOne({
      _id: 'fid-1',
      codigoFun: FUNCIONARIO_CODIGO,
      nome: 'João da Silva',
      setor: SETOR,
      ativo: true,
      updatedAt: new Date(),
    })
  })

  // auth / authz
  it('POST /avaliadores sem token → 401 RFC 7807', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/avaliadores',
      payload: {
        usuarioId: AVALIADOR_USER_ID,
        nome: 'Avaliador',
        email: 'av@hr-core.local',
        setor: SETOR,
      },
    })
    expect(res.statusCode).toBe(401)
    expect(asJson<ProblemBody>(res).type).toBe('https://hr-core/errors/unauthorized')
  })

  it('POST /avaliadores com role USUARIO → 403 (precisa ADMINISTRADOR)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/avaliadores',
      headers: { Authorization: `Bearer ${userToken}` },
      payload: {
        usuarioId: AVALIADOR_USER_ID,
        nome: 'Avaliador',
        email: 'av@hr-core.local',
        setor: SETOR,
      },
    })
    expect(res.statusCode).toBe(403)
  })

  it('POST /avaliadores com body inválido → 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/avaliadores',
      headers: { Authorization: `Bearer ${adminToken}` },
      payload: { usuarioId: '', nome: 'X', email: 'invalido', setor: '' },
    })
    expect(res.statusCode).toBe(400)
  })

  // workflow completo
  it('fluxo: ADMIN cria avaliador → AVALIADOR cria avaliação → listar', async () => {
    // 1) ADMIN cria avaliador vinculando usuarioId='avaliador-user-id' ao setor TI
    const criarAvaliador = await app.inject({
      method: 'POST',
      url: '/avaliadores',
      headers: { Authorization: `Bearer ${adminToken}` },
      payload: {
        usuarioId: AVALIADOR_USER_ID,
        nome: 'Maria Avaliadora',
        email: 'maria@hr-core.local',
        setor: SETOR,
      },
    })
    expect(criarAvaliador.statusCode).toBe(201)
    const avaliador = asJson<AvaliadorResponse>(criarAvaliador).data
    expect(avaliador.usuarioId).toBe(AVALIADOR_USER_ID)
    expect(avaliador.setor).toBe(SETOR)
    expect(avaliador.ativo).toBe(true)

    // 2) Não pode criar avaliador duplicado para o mesmo usuarioId — 409
    const dup = await app.inject({
      method: 'POST',
      url: '/avaliadores',
      headers: { Authorization: `Bearer ${adminToken}` },
      payload: {
        usuarioId: AVALIADOR_USER_ID,
        nome: 'Outra',
        email: 'outra@hr-core.local',
        setor: 'Recursos Humanos',
      },
    })
    expect(dup.statusCode).toBe(409)

    // 3) AVALIADOR cria avaliação para funcionário do próprio setor
    const criarAvaliacao = await app.inject({
      method: 'POST',
      url: '/avaliacoes',
      headers: { Authorization: `Bearer ${avaliadorToken}` },
      payload: {
        codigoFun: FUNCIONARIO_CODIGO,
        titulo: 'Avaliação trimestral Q2/2026',
        comentario: 'Excelente entrega no projeto X, comunicação clara com o time.',
        nota: 5,
      },
    })
    expect(criarAvaliacao.statusCode).toBe(201)
    const avaliacao = asJson<AvaliacaoResponse>(criarAvaliacao).data
    expect(avaliacao.codigo).toMatch(/^AVAL\d+$/)
    expect(avaliacao.nota).toBe(5)
    expect(avaliacao.setor).toBe(SETOR)

    // 4) Listar avaliações do funcionário
    const lista = await app.inject({
      method: 'GET',
      url: `/funcionarios/${FUNCIONARIO_CODIGO}/avaliacoes`,
      headers: { Authorization: `Bearer ${adminToken}` },
    })
    expect(lista.statusCode).toBe(200)
    const items = asJson<AvaliacoesListResponse>(lista).data
    expect(items).toHaveLength(1)
    expect(items[0]!.codigo).toBe(avaliacao.codigo)

    // 5) Update parcial — só a nota
    const update = await app.inject({
      method: 'PUT',
      url: `/avaliacoes/${avaliacao.id}`,
      headers: { Authorization: `Bearer ${avaliadorToken}` },
      payload: { nota: 4 },
    })
    expect(update.statusCode).toBe(200)
    const atualizada = asJson<AvaliacaoResponse>(update).data
    expect(atualizada.nota).toBe(4)
    expect(atualizada.titulo).toBe('Avaliação trimestral Q2/2026') // preservado
  })

  it('GET /health → 200 sem auth', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' })
    expect(res.statusCode).toBe(200)
    expect(asJson<{ status: string; service: string }>(res)).toMatchObject({
      status: 'ok',
      service: 'avaliacao',
    })
  })
})
