/**
 * E2E exemplar — cobre os endpoints de LEITURA do ms-avaliacao, complementando
 * `avaliacao-fluxo-completo.e2e.test.ts` (que foca em POST/PUT do happy path).
 *
 * Endpoints cobertos aqui:
 *
 *   - GET  /avaliadores                                 (ADMIN — lista global)
 *   - GET  /avaliadores/:id                             (ADMIN)
 *   - DELETE /avaliadores/:id                           (ADMIN — desativação)
 *   - GET  /avaliacoes                                  (ADMIN — lista global)
 *   - GET  /avaliacoes/:id                              (autenticado)
 *   - GET  /avaliacoes/codigo/:codigo                   (autenticado)
 *   - GET  /setores/:setor/avaliacoes                   (COORD/ADMIN)
 *   - GET  /avaliadores/:avaliadorId/avaliacoes         (AVALIADOR/ADMIN)
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
  status: number
  detail?: string
  traceId?: string
}

interface AvaliadorPublic {
  id: string
  usuarioId: string
  nome: string
  email: string
  setor: string
  ativo: boolean
}

interface AvaliadorResponse {
  data: AvaliadorPublic
}

interface AvaliadoresListResponse {
  data: AvaliadorPublic[]
}

interface AvaliacaoPublic {
  id: string
  codigo: string
  codigoFun: string
  titulo: string
  comentario: string
  nota: number
  setor: string
  avaliadorId: string
}

interface AvaliacaoResponse {
  data: AvaliacaoPublic
}

interface AvaliacoesListResponse {
  data: AvaliacaoPublic[]
  meta: { total: number; page: number; limit: number; pages: number }
}

function asJson<T>(res: InjectResponse): T {
  return res.json<T>()
}

const SETOR_TI = 'Tecnologia'
const SETOR_RH = 'Recursos Humanos'
const FUN_TI = 'FUN12345678900'
const FUN_RH = 'FUN98765432100'

const AVALIADOR_TI_USER = 'avaliador-ti-user'
const AVALIADOR_RH_USER = 'avaliador-rh-user'

describe('E2E — endpoints de leitura (avaliadores + avaliações)', () => {
  let mongo: MongoHarness
  let jwt: JwtHarness
  let events: InMemoryEventPublisher
  let app: FastifyInstance
  let adminToken: string
  let coordToken: string
  let userToken: string
  let avaliadorTiToken: string

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

    adminToken = await jwt.sign('admin-1', ['ADMINISTRADOR'])
    coordToken = await jwt.sign('coord-1', ['COORDENADOR'])
    userToken = await jwt.sign('user-1', ['USUARIO'])
    avaliadorTiToken = await jwt.sign(AVALIADOR_TI_USER, ['AVALIADOR'])
  }, 90_000)

  afterAll(async () => {
    await app.close()
    await jwt.stop()
    await mongo.stop()
  })

  /**
   * Cada teste recebe um setup limpo: 2 funcionários no cache (TI + RH),
   * 2 avaliadores (1 por setor) e 1 avaliação no setor TI feita pelo TI.
   * Retorna ids para asserções específicas.
   */
  async function seed(): Promise<{
    avaliadorTiId: string
    avaliacaoId: string
    avaliacaoCodigo: string
  }> {
    // Funcionários no cache (necessário para criar avaliação)
    await mongo.db.collection('funcionarios_cache').insertMany([
      {
        _id: 'fid-ti',
        codigoFun: FUN_TI,
        nome: 'João TI',
        setor: SETOR_TI,
        ativo: true,
        updatedAt: new Date(),
      },
      {
        _id: 'fid-rh',
        codigoFun: FUN_RH,
        nome: 'Maria RH',
        setor: SETOR_RH,
        ativo: true,
        updatedAt: new Date(),
      },
    ])

    // Cria avaliador TI
    const criarTi = await app.inject({
      method: 'POST',
      url: '/avaliadores',
      headers: { Authorization: `Bearer ${adminToken}` },
      payload: {
        usuarioId: AVALIADOR_TI_USER,
        nome: 'Av TI',
        email: 'avti@hr-core.local',
        setor: SETOR_TI,
      },
    })
    const avaliadorTiId = asJson<AvaliadorResponse>(criarTi).data.id

    // Cria avaliador RH (ruído)
    await app.inject({
      method: 'POST',
      url: '/avaliadores',
      headers: { Authorization: `Bearer ${adminToken}` },
      payload: {
        usuarioId: AVALIADOR_RH_USER,
        nome: 'Av RH',
        email: 'avrh@hr-core.local',
        setor: SETOR_RH,
      },
    })

    // Cria avaliação no setor TI
    const criarAv = await app.inject({
      method: 'POST',
      url: '/avaliacoes',
      headers: { Authorization: `Bearer ${avaliadorTiToken}` },
      payload: {
        codigoFun: FUN_TI,
        titulo: 'Avaliação Q2 TI',
        comentario: 'Bom desempenho no projeto X durante o trimestre.',
        nota: 4,
      },
    })
    const avaliacao = asJson<AvaliacaoResponse>(criarAv).data
    return { avaliadorTiId, avaliacaoId: avaliacao.id, avaliacaoCodigo: avaliacao.codigo }
  }

  beforeEach(async () => {
    await mongo.reset()
    events.reset()
  })

  // ─── /avaliadores (leitura) ──────────────────────────────────────────
  describe('/avaliadores', () => {
    it('GET /avaliadores sem token → 401', async () => {
      const res = await app.inject({ method: 'GET', url: '/avaliadores' })
      expect(res.statusCode).toBe(401)
      expect(asJson<ProblemBody>(res).type).toBe('https://hr-core/errors/unauthorized')
    })

    it('GET /avaliadores como USUARIO → 403', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/avaliadores',
        headers: { Authorization: `Bearer ${userToken}` },
      })
      expect(res.statusCode).toBe(403)
    })

    it('GET /avaliadores como ADMIN retorna lista', async () => {
      await seed()
      const res = await app.inject({
        method: 'GET',
        url: '/avaliadores',
        headers: { Authorization: `Bearer ${adminToken}` },
      })
      expect(res.statusCode).toBe(200)
      const list = asJson<AvaliadoresListResponse>(res).data
      expect(list).toHaveLength(2)
      expect(list.map((a) => a.setor).sort()).toEqual([SETOR_RH, SETOR_TI])
    })

    it('GET /avaliadores?setor=Tecnologia filtra', async () => {
      await seed()
      const res = await app.inject({
        method: 'GET',
        url: `/avaliadores?setor=${encodeURIComponent(SETOR_TI)}`,
        headers: { Authorization: `Bearer ${adminToken}` },
      })
      expect(res.statusCode).toBe(200)
      const list = asJson<AvaliadoresListResponse>(res).data
      expect(list).toHaveLength(1)
      expect(list[0]!.setor).toBe(SETOR_TI)
    })

    it('GET /avaliadores/:id retorna detalhe', async () => {
      const { avaliadorTiId } = await seed()
      const res = await app.inject({
        method: 'GET',
        url: `/avaliadores/${avaliadorTiId}`,
        headers: { Authorization: `Bearer ${adminToken}` },
      })
      expect(res.statusCode).toBe(200)
      expect(asJson<AvaliadorResponse>(res).data.usuarioId).toBe(AVALIADOR_TI_USER)
    })

    it('GET /avaliadores/:id inexistente → 404', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/avaliadores/507f1f77bcf86cd799439011',
        headers: { Authorization: `Bearer ${adminToken}` },
      })
      expect(res.statusCode).toBe(404)
    })

    it('DELETE /avaliadores/:id desativa (não apaga)', async () => {
      const { avaliadorTiId } = await seed()
      const del = await app.inject({
        method: 'DELETE',
        url: `/avaliadores/${avaliadorTiId}`,
        headers: { Authorization: `Bearer ${adminToken}` },
      })
      expect([200, 204]).toContain(del.statusCode)

      // Recupera e confirma ativo=false
      const get = await app.inject({
        method: 'GET',
        url: `/avaliadores/${avaliadorTiId}`,
        headers: { Authorization: `Bearer ${adminToken}` },
      })
      expect(get.statusCode).toBe(200)
      expect(asJson<AvaliadorResponse>(get).data.ativo).toBe(false)
    })

    it('DELETE /avaliadores como USUARIO → 403', async () => {
      const { avaliadorTiId } = await seed()
      const res = await app.inject({
        method: 'DELETE',
        url: `/avaliadores/${avaliadorTiId}`,
        headers: { Authorization: `Bearer ${userToken}` },
      })
      expect(res.statusCode).toBe(403)
    })
  })

  // ─── /avaliacoes (leitura) ───────────────────────────────────────────
  describe('/avaliacoes', () => {
    it('GET /avaliacoes/:id retorna avaliação', async () => {
      const { avaliacaoId } = await seed()
      const res = await app.inject({
        method: 'GET',
        url: `/avaliacoes/${avaliacaoId}`,
        headers: { Authorization: `Bearer ${adminToken}` },
      })
      expect(res.statusCode).toBe(200)
      expect(asJson<AvaliacaoResponse>(res).data.id).toBe(avaliacaoId)
    })

    it('GET /avaliacoes/codigo/:codigo busca por código humano-legível', async () => {
      const { avaliacaoId, avaliacaoCodigo } = await seed()
      const res = await app.inject({
        method: 'GET',
        url: `/avaliacoes/codigo/${avaliacaoCodigo}`,
        headers: { Authorization: `Bearer ${adminToken}` },
      })
      expect(res.statusCode).toBe(200)
      expect(asJson<AvaliacaoResponse>(res).data.id).toBe(avaliacaoId)
    })

    it('GET /avaliacoes/codigo/:codigo inexistente → 404', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/avaliacoes/codigo/AVAL999999',
        headers: { Authorization: `Bearer ${adminToken}` },
      })
      expect(res.statusCode).toBe(404)
    })

    it('GET /setores/:setor/avaliacoes retorna apenas do setor', async () => {
      await seed()
      const res = await app.inject({
        method: 'GET',
        url: `/setores/${encodeURIComponent(SETOR_TI)}/avaliacoes`,
        headers: { Authorization: `Bearer ${coordToken}` },
      })
      expect(res.statusCode).toBe(200)
      const list = asJson<AvaliacoesListResponse>(res)
      expect(list.meta.total).toBe(1)
      expect(list.data[0]!.setor).toBe(SETOR_TI)
    })

    it('GET /setores/:setor/avaliacoes como USUARIO → 403', async () => {
      await seed()
      const res = await app.inject({
        method: 'GET',
        url: `/setores/${encodeURIComponent(SETOR_TI)}/avaliacoes`,
        headers: { Authorization: `Bearer ${userToken}` },
      })
      expect(res.statusCode).toBe(403)
    })

    it('GET /avaliadores/:avaliadorId/avaliacoes lista avaliações feitas pelo avaliador', async () => {
      const { avaliadorTiId } = await seed()
      const res = await app.inject({
        method: 'GET',
        url: `/avaliadores/${avaliadorTiId}/avaliacoes`,
        headers: { Authorization: `Bearer ${adminToken}` },
      })
      expect(res.statusCode).toBe(200)
      const list = asJson<AvaliacoesListResponse>(res)
      expect(list.meta.total).toBe(1)
      expect(list.data[0]!.avaliadorId).toBe(avaliadorTiId)
    })

    it('GET /avaliadores/:avaliadorId/avaliacoes acessível pelo próprio AVALIADOR', async () => {
      const { avaliadorTiId } = await seed()
      const res = await app.inject({
        method: 'GET',
        url: `/avaliadores/${avaliadorTiId}/avaliacoes`,
        headers: { Authorization: `Bearer ${avaliadorTiToken}` },
      })
      expect(res.statusCode).toBe(200)
    })

    it('GET /avaliacoes/:id sem token → 401', async () => {
      const { avaliacaoId } = await seed()
      const res = await app.inject({ method: 'GET', url: `/avaliacoes/${avaliacaoId}` })
      expect(res.statusCode).toBe(401)
    })
  })
})
