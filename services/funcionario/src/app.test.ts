/**
 * Integração — sobe o app inteiro (buildApp) contra um Mongo real e um
 * JWKS server local, exercita rotas via app.inject. Cobre:
 *   - controllers (funcionario, health)
 *   - schemas Zod
 *   - middlewares (error-handler, auth, cors, metrics)
 *   - service + repositories
 */
import { type FastifyInstance } from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { cleanCollections, closeTestDb, getTestDb } from '../test/db.js'
import { startJwksServer, type JwksServer } from '../test/jwks.js'

interface DataEnvelope<T> {
  data: T
}
interface ListEnvelope<T> {
  data: T[]
  meta: { total: number; page: number; limit: number; pages: number }
}
interface PublicFunc {
  id: string
  codigoFun: string
  codigoHR: string
  nome: string
  cpf: string
  email: string
  cargo: string
  departamento: string
  telefone: string
  gestorId: string | null
  status: string
  score: number
  asoValido: boolean
  ctpsDigital: boolean
}

describe('funcionario app (integração)', () => {
  let jwks: JwksServer
  let app: FastifyInstance
  const storageStub = {
    putObject: vi.fn().mockResolvedValue(undefined),
    getPresignedDownloadUrl: vi.fn(async (key: string) => `https://signed.test/${key}`),
  }

  beforeAll(async () => {
    jwks = await startJwksServer({ issuer: 'https://auth.test', audience: 'hr-core' })
    vi.stubEnv('AUTH_JWKS_URL', jwks.url)
    vi.resetModules()
    const db = await getTestDb()
    const mod = await import('./app.js')
    app = await mod.buildApp({ db, storage: storageStub })
    await app.ready()
  })

  beforeEach(async () => {
    const db = await getTestDb()
    await cleanCollections(db)
  })

  afterAll(async () => {
    await app.close()
    await closeTestDb()
    await jwks.stop()
    vi.unstubAllEnvs()
  })

  const ADMIN_TOKEN = (): Promise<string> => jwks.sign({ sub: 'admin-1', roles: ['ADMINISTRADOR'] })
  const COORD_TOKEN = (): Promise<string> => jwks.sign({ sub: 'coord-1', roles: ['COORDENADOR'] })
  const USER_TOKEN = (): Promise<string> => jwks.sign({ sub: 'user-1', roles: ['USUARIO'] })

  const VALID_PAYLOAD = {
    nome: 'João Silva',
    cpf: '111.444.777-35',
    email: 'joao@x.com',
    telefone: '11999999999',
    cargo: 'Dev',
    departamento: 'Tech',
  }

  // ─── health ─────────────────────────────────────────────────────────────
  describe('GET /health', () => {
    it('200 com service=funcionario', async () => {
      const res = await app.inject({ method: 'GET', url: '/health' })
      expect(res.statusCode).toBe(200)
      const body = JSON.parse(res.payload) as { status: string; service: string }
      expect(body.service).toBe('funcionario')
    })

    it('propaga X-Trace-Id para resposta de erro', async () => {
      const traceId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
      const res = await app.inject({
        method: 'GET',
        url: '/nope',
        headers: { 'x-trace-id': traceId },
      })
      expect(res.statusCode).toBe(404)
      const body = JSON.parse(res.payload) as { traceId: string }
      expect(body.traceId).toBe(traceId)
    })
  })

  // ─── POST /funcionarios (USUARIO) ───────────────────────────────────────
  describe('POST /funcionarios', () => {
    it('201 quando USUARIO cria com payload válido', async () => {
      const token = await USER_TOKEN()
      const res = await app.inject({
        method: 'POST',
        url: '/funcionarios',
        headers: { authorization: `Bearer ${token}` },
        payload: VALID_PAYLOAD,
      })
      expect(res.statusCode).toBe(201)
      const { data } = JSON.parse(res.payload) as DataEnvelope<PublicFunc>
      expect(data.codigoFun).toBe('FUN11144477735')
      expect(data.codigoHR).toBe('HR0000001')
      // Funcionário nasce PENDENTE — só vira ATIVO após workflow de admissão.
      expect(data.status).toBe('PENDENTE')
      expect(data.score).toBe(0)
      expect(data.asoValido).toBe(false)
      expect(data.ctpsDigital).toBe(false)
      expect(data.cpf).toBe('11144477735') // canônico sem máscara
    })

    it('códigos HR são sequenciais ao criar 2 funcionarios', async () => {
      const token = await USER_TOKEN()
      await app.inject({
        method: 'POST',
        url: '/funcionarios',
        headers: { authorization: `Bearer ${token}` },
        payload: VALID_PAYLOAD,
      })
      const res2 = await app.inject({
        method: 'POST',
        url: '/funcionarios',
        headers: { authorization: `Bearer ${token}` },
        payload: { ...VALID_PAYLOAD, cpf: '529.982.247-25', email: 'b@x.com' },
      })
      const { data } = JSON.parse(res2.payload) as DataEnvelope<PublicFunc>
      expect(data.codigoHR).toBe('HR0000002')
    })

    it('401 sem Authorization header', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/funcionarios',
        payload: VALID_PAYLOAD,
      })
      expect(res.statusCode).toBe(401)
    })

    it('403 quando COORDENADOR tenta criar', async () => {
      const token = await COORD_TOKEN()
      const res = await app.inject({
        method: 'POST',
        url: '/funcionarios',
        headers: { authorization: `Bearer ${token}` },
        payload: VALID_PAYLOAD,
      })
      expect(res.statusCode).toBe(403)
    })

    it('403 quando ADMINISTRADOR tenta criar (sem acesso ao funcionario service)', async () => {
      const token = await ADMIN_TOKEN()
      const res = await app.inject({
        method: 'POST',
        url: '/funcionarios',
        headers: { authorization: `Bearer ${token}` },
        payload: VALID_PAYLOAD,
      })
      expect(res.statusCode).toBe(403)
    })

    it('422 cpf-invalido para CPF mal-formado', async () => {
      const token = await USER_TOKEN()
      const res = await app.inject({
        method: 'POST',
        url: '/funcionarios',
        headers: { authorization: `Bearer ${token}` },
        payload: { ...VALID_PAYLOAD, cpf: '000.000.000-00' },
      })
      expect(res.statusCode).toBe(422)
      const body = JSON.parse(res.payload) as { type: string }
      expect(body.type).toContain('cpf-invalido')
    })

    it('409 cpf-duplicado quando CPF já existe', async () => {
      const token = await USER_TOKEN()
      await app.inject({
        method: 'POST',
        url: '/funcionarios',
        headers: { authorization: `Bearer ${token}` },
        payload: VALID_PAYLOAD,
      })
      const res = await app.inject({
        method: 'POST',
        url: '/funcionarios',
        headers: { authorization: `Bearer ${token}` },
        payload: { ...VALID_PAYLOAD, email: 'outro@x.com' },
      })
      expect(res.statusCode).toBe(409)
      const body = JSON.parse(res.payload) as { type: string }
      expect(body.type).toContain('cpf-duplicado')
    })

    it('409 email-duplicado quando email já existe', async () => {
      const token = await USER_TOKEN()
      await app.inject({
        method: 'POST',
        url: '/funcionarios',
        headers: { authorization: `Bearer ${token}` },
        payload: VALID_PAYLOAD,
      })
      const res = await app.inject({
        method: 'POST',
        url: '/funcionarios',
        headers: { authorization: `Bearer ${token}` },
        payload: { ...VALID_PAYLOAD, cpf: '529.982.247-25' },
      })
      expect(res.statusCode).toBe(409)
      const body = JSON.parse(res.payload) as { type: string }
      expect(body.type).toContain('email-duplicado')
    })

    it('400 quando payload Zod falha (email inválido)', async () => {
      const token = await USER_TOKEN()
      const res = await app.inject({
        method: 'POST',
        url: '/funcionarios',
        headers: { authorization: `Bearer ${token}` },
        payload: { ...VALID_PAYLOAD, email: 'nao-email' },
      })
      expect(res.statusCode).toBe(400)
    })
  })

  // ─── GET /funcionarios (USUARIO ou COORDENADOR) ──────────────────────────
  describe('GET /funcionarios', () => {
    async function seedTwo() {
      const token = await USER_TOKEN()
      await app.inject({
        method: 'POST',
        url: '/funcionarios',
        headers: { authorization: `Bearer ${token}` },
        payload: VALID_PAYLOAD,
      })
      await app.inject({
        method: 'POST',
        url: '/funcionarios',
        headers: { authorization: `Bearer ${token}` },
        payload: { ...VALID_PAYLOAD, cpf: '529.982.247-25', email: 'b@x.com' },
      })
    }

    it('200 com paginação meta para USUARIO', async () => {
      await seedTwo()
      const token = await USER_TOKEN()
      const res = await app.inject({
        method: 'GET',
        url: '/funcionarios',
        headers: { authorization: `Bearer ${token}` },
      })
      expect(res.statusCode).toBe(200)
      const body = JSON.parse(res.payload) as ListEnvelope<PublicFunc>
      expect(body.meta.total).toBe(2)
      expect(body.data).toHaveLength(2)
    })

    it('200 para COORDENADOR', async () => {
      await seedTwo()
      const token = await COORD_TOKEN()
      const res = await app.inject({
        method: 'GET',
        url: '/funcionarios',
        headers: { authorization: `Bearer ${token}` },
      })
      expect(res.statusCode).toBe(200)
    })

    it('403 para ADMINISTRADOR (sem acesso ao funcionario service)', async () => {
      await seedTwo()
      const token = await ADMIN_TOKEN()
      const res = await app.inject({
        method: 'GET',
        url: '/funcionarios',
        headers: { authorization: `Bearer ${token}` },
      })
      expect(res.statusCode).toBe(403)
    })

    it('filtra por departamento', async () => {
      const token = await USER_TOKEN()
      await app.inject({
        method: 'POST',
        url: '/funcionarios',
        headers: { authorization: `Bearer ${token}` },
        payload: VALID_PAYLOAD,
      })
      await app.inject({
        method: 'POST',
        url: '/funcionarios',
        headers: { authorization: `Bearer ${token}` },
        payload: {
          ...VALID_PAYLOAD,
          cpf: '529.982.247-25',
          email: 'b@x.com',
          departamento: 'Financeiro',
        },
      })
      const res = await app.inject({
        method: 'GET',
        url: '/funcionarios?departamento=Tech',
        headers: { authorization: `Bearer ${token}` },
      })
      const body = JSON.parse(res.payload) as ListEnvelope<PublicFunc>
      expect(body.meta.total).toBe(1)
    })
  })

  // ─── GET /funcionarios/:id (USUARIO ou COORDENADOR) ──────────────────────
  describe('GET /funcionarios/:id', () => {
    it('200 para USUARIO autenticado', async () => {
      const user = await USER_TOKEN()
      const created = await app.inject({
        method: 'POST',
        url: '/funcionarios',
        headers: { authorization: `Bearer ${user}` },
        payload: VALID_PAYLOAD,
      })
      const { data } = JSON.parse(created.payload) as DataEnvelope<PublicFunc>

      const res = await app.inject({
        method: 'GET',
        url: `/funcionarios/${data.id}`,
        headers: { authorization: `Bearer ${user}` },
      })
      expect(res.statusCode).toBe(200)
    })

    it('200 para COORDENADOR', async () => {
      const user = await USER_TOKEN()
      const created = await app.inject({
        method: 'POST',
        url: '/funcionarios',
        headers: { authorization: `Bearer ${user}` },
        payload: VALID_PAYLOAD,
      })
      const { data } = JSON.parse(created.payload) as DataEnvelope<PublicFunc>

      const coord = await COORD_TOKEN()
      const res = await app.inject({
        method: 'GET',
        url: `/funcionarios/${data.id}`,
        headers: { authorization: `Bearer ${coord}` },
      })
      expect(res.statusCode).toBe(200)
    })

    it('403 para ADMINISTRADOR (sem acesso ao funcionario service)', async () => {
      const user = await USER_TOKEN()
      const created = await app.inject({
        method: 'POST',
        url: '/funcionarios',
        headers: { authorization: `Bearer ${user}` },
        payload: VALID_PAYLOAD,
      })
      const { data } = JSON.parse(created.payload) as DataEnvelope<PublicFunc>

      const admin = await ADMIN_TOKEN()
      const res = await app.inject({
        method: 'GET',
        url: `/funcionarios/${data.id}`,
        headers: { authorization: `Bearer ${admin}` },
      })
      expect(res.statusCode).toBe(403)
    })

    it('404 funcionario-nao-encontrado para ID válido mas inexistente', async () => {
      const token = await USER_TOKEN()
      const res = await app.inject({
        method: 'GET',
        url: '/funcionarios/000000000000000000000000',
        headers: { authorization: `Bearer ${token}` },
      })
      expect(res.statusCode).toBe(404)
      const body = JSON.parse(res.payload) as { type: string }
      expect(body.type).toContain('funcionario-nao-encontrado')
    })

    it('401 sem Authorization', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/funcionarios/000000000000000000000000',
      })
      expect(res.statusCode).toBe(401)
    })
  })

  // ─── DELETE /funcionarios/:id (USUARIO, soft delete) ────────────────────
  describe('DELETE /funcionarios/:id', () => {
    it('204 quando USUARIO desliga ATIVO', async () => {
      const token = await USER_TOKEN()
      const created = await app.inject({
        method: 'POST',
        url: '/funcionarios',
        headers: { authorization: `Bearer ${token}` },
        payload: VALID_PAYLOAD,
      })
      const { data } = JSON.parse(created.payload) as DataEnvelope<PublicFunc>

      const res = await app.inject({
        method: 'DELETE',
        url: `/funcionarios/${data.id}`,
        headers: { authorization: `Bearer ${token}` },
      })
      expect(res.statusCode).toBe(204)
    })

    it('409 funcionario-ja-desligado em segunda chamada', async () => {
      const token = await USER_TOKEN()
      const created = await app.inject({
        method: 'POST',
        url: '/funcionarios',
        headers: { authorization: `Bearer ${token}` },
        payload: VALID_PAYLOAD,
      })
      const { data } = JSON.parse(created.payload) as DataEnvelope<PublicFunc>
      await app.inject({
        method: 'DELETE',
        url: `/funcionarios/${data.id}`,
        headers: { authorization: `Bearer ${token}` },
      })
      const res = await app.inject({
        method: 'DELETE',
        url: `/funcionarios/${data.id}`,
        headers: { authorization: `Bearer ${token}` },
      })
      expect(res.statusCode).toBe(409)
      const body = JSON.parse(res.payload) as { type: string }
      expect(body.type).toContain('funcionario-ja-desligado')
    })

    it('403 quando COORDENADOR tenta desligar', async () => {
      const user = await USER_TOKEN()
      const created = await app.inject({
        method: 'POST',
        url: '/funcionarios',
        headers: { authorization: `Bearer ${user}` },
        payload: VALID_PAYLOAD,
      })
      const { data } = JSON.parse(created.payload) as DataEnvelope<PublicFunc>
      const coord = await COORD_TOKEN()
      const res = await app.inject({
        method: 'DELETE',
        url: `/funcionarios/${data.id}`,
        headers: { authorization: `Bearer ${coord}` },
      })
      expect(res.statusCode).toBe(403)
    })

    it('403 quando ADMINISTRADOR tenta desligar (sem acesso ao funcionario service)', async () => {
      const user = await USER_TOKEN()
      const created = await app.inject({
        method: 'POST',
        url: '/funcionarios',
        headers: { authorization: `Bearer ${user}` },
        payload: VALID_PAYLOAD,
      })
      const { data } = JSON.parse(created.payload) as DataEnvelope<PublicFunc>
      const admin = await ADMIN_TOKEN()
      const res = await app.inject({
        method: 'DELETE',
        url: `/funcionarios/${data.id}`,
        headers: { authorization: `Bearer ${admin}` },
      })
      expect(res.statusCode).toBe(403)
    })
  })

  // ─── POST /funcionarios/:id/documentos (USUARIO, multipart) ─────────────
  describe('POST /funcionarios/:id/documentos', () => {
    async function multipartBody(opts: {
      tipo?: string
      filename?: string
      mime?: string
      content?: Buffer
      semFile?: boolean
    }): Promise<{ body: Buffer; contentType: string }> {
      const fd = new FormData()
      if (opts.tipo !== undefined) fd.append('tipo', opts.tipo)
      if (!opts.semFile) {
        const content = opts.content ?? Buffer.from('arquivo-fake')
        // Copia para um ArrayBuffer fresco — Buffer.from() pode usar
        // SharedArrayBuffer internamente e o tipo `BlobPart` exige ArrayBuffer.
        const ab = new ArrayBuffer(content.byteLength)
        new Uint8Array(ab).set(content)
        fd.append(
          'file',
          new Blob([ab], { type: opts.mime ?? 'application/pdf' }),
          opts.filename ?? 'doc.pdf',
        )
      }
      const req = new Request('http://x', { method: 'POST', body: fd })
      return {
        body: Buffer.from(await req.arrayBuffer()),
        contentType: req.headers.get('content-type') ?? '',
      }
    }

    async function criarFuncionario(token: string): Promise<string> {
      const res = await app.inject({
        method: 'POST',
        url: '/funcionarios',
        headers: { authorization: `Bearer ${token}` },
        payload: VALID_PAYLOAD,
      })
      const { data } = JSON.parse(res.payload) as DataEnvelope<PublicFunc>
      return data.id
    }

    it('201 upload de PDF como USUARIO — sobe arquivo no storage e transita funcionário', async () => {
      storageStub.putObject.mockClear()
      const token = await USER_TOKEN()
      const funcionarioId = await criarFuncionario(token)
      const { body, contentType } = await multipartBody({ tipo: 'RG' })

      const res = await app.inject({
        method: 'POST',
        url: `/funcionarios/${funcionarioId}/documentos`,
        headers: { authorization: `Bearer ${token}`, 'content-type': contentType },
        payload: body,
      })
      expect(res.statusCode).toBe(201)
      const { data } = JSON.parse(res.payload) as DataEnvelope<{
        tipo: string
        status: string
        downloadUrl: string
        funcionarioId: string
      }>
      expect(data.tipo).toBe('RG')
      expect(data.status).toBe('PENDENTE')
      expect(data.downloadUrl).toMatch(/^https:\/\/signed\.test\//)
      expect(storageStub.putObject).toHaveBeenCalledTimes(1)

      // funcionário foi promovido para EM_VALIDACAO
      const get = await app.inject({
        method: 'GET',
        url: `/funcionarios/${funcionarioId}`,
        headers: { authorization: `Bearer ${token}` },
      })
      const updated = JSON.parse(get.payload) as DataEnvelope<PublicFunc>
      expect(updated.data.status).toBe('EM_VALIDACAO')
    })

    it('400 quando o multipart não tem arquivo', async () => {
      const token = await USER_TOKEN()
      const funcionarioId = await criarFuncionario(token)
      const { body, contentType } = await multipartBody({ tipo: 'RG', semFile: true })
      const res = await app.inject({
        method: 'POST',
        url: `/funcionarios/${funcionarioId}/documentos`,
        headers: { authorization: `Bearer ${token}`, 'content-type': contentType },
        payload: body,
      })
      expect(res.statusCode).toBe(400)
      expect(JSON.parse(res.payload).type).toContain('arquivo-ausente')
    })

    it('422 quando o campo tipo é inválido', async () => {
      const token = await USER_TOKEN()
      const funcionarioId = await criarFuncionario(token)
      const { body, contentType } = await multipartBody({ tipo: 'INVALIDO' })
      const res = await app.inject({
        method: 'POST',
        url: `/funcionarios/${funcionarioId}/documentos`,
        headers: { authorization: `Bearer ${token}`, 'content-type': contentType },
        payload: body,
      })
      expect(res.statusCode).toBe(422)
      expect(JSON.parse(res.payload).type).toContain('tipo-documento-invalido')
    })

    it('422 quando o MIME type não é aceito', async () => {
      const token = await USER_TOKEN()
      const funcionarioId = await criarFuncionario(token)
      const { body, contentType } = await multipartBody({
        tipo: 'RG',
        mime: 'application/zip',
      })
      const res = await app.inject({
        method: 'POST',
        url: `/funcionarios/${funcionarioId}/documentos`,
        headers: { authorization: `Bearer ${token}`, 'content-type': contentType },
        payload: body,
      })
      expect(res.statusCode).toBe(422)
      expect(JSON.parse(res.payload).type).toContain('mime-type-nao-suportado')
    })

    it('403 quando COORDENADOR tenta enviar documento', async () => {
      const user = await USER_TOKEN()
      const coord = await COORD_TOKEN()
      const funcionarioId = await criarFuncionario(user)
      const { body, contentType } = await multipartBody({ tipo: 'RG' })
      const res = await app.inject({
        method: 'POST',
        url: `/funcionarios/${funcionarioId}/documentos`,
        headers: { authorization: `Bearer ${coord}`, 'content-type': contentType },
        payload: body,
      })
      expect(res.statusCode).toBe(403)
    })

    it('404 quando o funcionário não existe', async () => {
      const token = await USER_TOKEN()
      const { body, contentType } = await multipartBody({ tipo: 'RG' })
      const res = await app.inject({
        method: 'POST',
        url: '/funcionarios/000000000000000000000000/documentos',
        headers: { authorization: `Bearer ${token}`, 'content-type': contentType },
        payload: body,
      })
      expect(res.statusCode).toBe(404)
      expect(JSON.parse(res.payload).type).toContain('funcionario-nao-encontrado')
    })
  })

  // ─── GET /funcionarios/:id/documentos (USUARIO ou COORDENADOR) ───────────
  describe('GET /funcionarios/:id/documentos', () => {
    it('200 lista vazia para funcionário recém-criado', async () => {
      const token = await USER_TOKEN()
      const create = await app.inject({
        method: 'POST',
        url: '/funcionarios',
        headers: { authorization: `Bearer ${token}` },
        payload: VALID_PAYLOAD,
      })
      const { data } = JSON.parse(create.payload) as DataEnvelope<PublicFunc>
      const res = await app.inject({
        method: 'GET',
        url: `/funcionarios/${data.id}/documentos`,
        headers: { authorization: `Bearer ${token}` },
      })
      expect(res.statusCode).toBe(200)
      const body = JSON.parse(res.payload) as { data: unknown[] }
      expect(body.data).toEqual([])
    })

    it('200 para COORDENADOR (read-only)', async () => {
      const user = await USER_TOKEN()
      const coord = await COORD_TOKEN()
      const create = await app.inject({
        method: 'POST',
        url: '/funcionarios',
        headers: { authorization: `Bearer ${user}` },
        payload: VALID_PAYLOAD,
      })
      const { data } = JSON.parse(create.payload) as DataEnvelope<PublicFunc>
      const res = await app.inject({
        method: 'GET',
        url: `/funcionarios/${data.id}/documentos`,
        headers: { authorization: `Bearer ${coord}` },
      })
      expect(res.statusCode).toBe(200)
    })
  })

  // ─── POST /documentos/:id/aprovar (COORDENADOR) ──────────────────────────
  describe('POST /documentos/:id/aprovar', () => {
    async function multipartBody(opts: {
      tipo: string
      mime?: string
      filename?: string
    }): Promise<{ body: Buffer; contentType: string }> {
      const fd = new FormData()
      fd.append('tipo', opts.tipo)
      const content = Buffer.from('arquivo-fake')
      const ab = new ArrayBuffer(content.byteLength)
      new Uint8Array(ab).set(content)
      fd.append(
        'file',
        new Blob([ab], { type: opts.mime ?? 'application/pdf' }),
        opts.filename ?? 'doc.pdf',
      )
      const req = new Request('http://x', { method: 'POST', body: fd })
      return {
        body: Buffer.from(await req.arrayBuffer()),
        contentType: req.headers.get('content-type') ?? '',
      }
    }

    async function uploadDoc(token: string, funcionarioId: string, tipo: string): Promise<string> {
      const { body, contentType } = await multipartBody({ tipo })
      const res = await app.inject({
        method: 'POST',
        url: `/funcionarios/${funcionarioId}/documentos`,
        headers: { authorization: `Bearer ${token}`, 'content-type': contentType },
        payload: body,
      })
      expect(res.statusCode).toBe(201)
      return (JSON.parse(res.payload) as DataEnvelope<{ id: string }>).data.id
    }

    async function criarFuncionario(token: string): Promise<string> {
      const res = await app.inject({
        method: 'POST',
        url: '/funcionarios',
        headers: { authorization: `Bearer ${token}` },
        payload: VALID_PAYLOAD,
      })
      return (JSON.parse(res.payload) as DataEnvelope<PublicFunc>).data.id
    }

    it('golden path: 6 uploads + 6 aprovações → funcionário vira ATIVO', async () => {
      const user = await USER_TOKEN()
      const coord = await COORD_TOKEN()
      const funcionarioId = await criarFuncionario(user)

      const tipos = [
        'RG',
        'CPF',
        'CTPS_DIGITAL',
        'ASO_ADMISSIONAL',
        'PIS',
        'COMPROVANTE_ENDERECO',
      ] as const
      const docIds: string[] = []
      for (const tipo of tipos) docIds.push(await uploadDoc(user, funcionarioId, tipo))

      // Após uploads o funcionário está EM_VALIDACAO e score=0
      const afterUpload = await app.inject({
        method: 'GET',
        url: `/funcionarios/${funcionarioId}`,
        headers: { authorization: `Bearer ${user}` },
      })
      const snapshotUpload = (JSON.parse(afterUpload.payload) as DataEnvelope<PublicFunc>).data
      expect(snapshotUpload.status).toBe('EM_VALIDACAO')
      expect(snapshotUpload.score).toBe(0)

      // Aprova 5 docs — não pode promover ainda
      for (let i = 0; i < 5; i++) {
        const r = await app.inject({
          method: 'POST',
          url: `/documentos/${docIds[i]}/aprovar`,
          headers: { authorization: `Bearer ${coord}` },
        })
        expect(r.statusCode).toBe(200)
      }
      const apos5 = await app.inject({
        method: 'GET',
        url: `/funcionarios/${funcionarioId}`,
        headers: { authorization: `Bearer ${user}` },
      })
      const s5 = (JSON.parse(apos5.payload) as DataEnvelope<PublicFunc>).data
      expect(s5.status).toBe('EM_VALIDACAO')
      expect(s5.score).toBeLessThan(100)
      // 5 dos 6 aprovados — score depende de qual ficou faltando.

      // Aprova o sexto — agora promove ATIVO
      const r6 = await app.inject({
        method: 'POST',
        url: `/documentos/${docIds[5]}/aprovar`,
        headers: { authorization: `Bearer ${coord}` },
      })
      expect(r6.statusCode).toBe(200)

      const final = await app.inject({
        method: 'GET',
        url: `/funcionarios/${funcionarioId}`,
        headers: { authorization: `Bearer ${user}` },
      })
      const sf = (JSON.parse(final.payload) as DataEnvelope<PublicFunc>).data
      expect(sf.status).toBe('ATIVO')
      expect(sf.score).toBe(100)
      expect(sf.asoValido).toBe(true)
      expect(sf.ctpsDigital).toBe(true)
    })

    it('bulk-approve: 6 uploads → 1 POST aprovar-pendentes → ATIVO', async () => {
      const user = await USER_TOKEN()
      const coord = await COORD_TOKEN()
      const funcionarioId = await criarFuncionario(user)
      for (const tipo of [
        'RG',
        'CPF',
        'CTPS_DIGITAL',
        'ASO_ADMISSIONAL',
        'PIS',
        'COMPROVANTE_ENDERECO',
      ] as const) {
        await uploadDoc(user, funcionarioId, tipo)
      }

      const res = await app.inject({
        method: 'POST',
        url: `/funcionarios/${funcionarioId}/documentos/aprovar-pendentes`,
        headers: { authorization: `Bearer ${coord}` },
      })
      expect(res.statusCode).toBe(200)
      const { data } = JSON.parse(res.payload) as DataEnvelope<{
        aprovados: number
        score: number
        asoValido: boolean
        ctpsDigital: boolean
        statusFuncionario: string
      }>
      expect(data.aprovados).toBe(6)
      expect(data.score).toBe(100)
      expect(data.asoValido).toBe(true)
      expect(data.ctpsDigital).toBe(true)
      expect(data.statusFuncionario).toBe('ATIVO')
    })

    it('bulk-approve sem pendentes → 200 com aprovados=0 (idempotente)', async () => {
      const user = await USER_TOKEN()
      const coord = await COORD_TOKEN()
      const funcionarioId = await criarFuncionario(user)
      // segundo chamado: já não há mais PENDENTES
      const res = await app.inject({
        method: 'POST',
        url: `/funcionarios/${funcionarioId}/documentos/aprovar-pendentes`,
        headers: { authorization: `Bearer ${coord}` },
      })
      expect(res.statusCode).toBe(200)
      const { data } = JSON.parse(res.payload) as DataEnvelope<{
        aprovados: number
        statusFuncionario: string
      }>
      expect(data.aprovados).toBe(0)
      expect(data.statusFuncionario).toBe('PENDENTE')
    })

    it('bulk-approve com USUARIO → 403', async () => {
      const user = await USER_TOKEN()
      const funcionarioId = await criarFuncionario(user)
      const res = await app.inject({
        method: 'POST',
        url: `/funcionarios/${funcionarioId}/documentos/aprovar-pendentes`,
        headers: { authorization: `Bearer ${user}` },
      })
      expect(res.statusCode).toBe(403)
    })

    it('bulk-approve em funcionário inexistente → 404', async () => {
      const coord = await COORD_TOKEN()
      const res = await app.inject({
        method: 'POST',
        url: '/funcionarios/000000000000000000000000/documentos/aprovar-pendentes',
        headers: { authorization: `Bearer ${coord}` },
      })
      expect(res.statusCode).toBe(404)
      expect(JSON.parse(res.payload).type).toContain('funcionario-nao-encontrado')
    })

    it('409 ao aprovar duas vezes o mesmo documento', async () => {
      const user = await USER_TOKEN()
      const coord = await COORD_TOKEN()
      const funcionarioId = await criarFuncionario(user)
      const docId = await uploadDoc(user, funcionarioId, 'RG')

      const ok = await app.inject({
        method: 'POST',
        url: `/documentos/${docId}/aprovar`,
        headers: { authorization: `Bearer ${coord}` },
      })
      expect(ok.statusCode).toBe(200)

      const dupe = await app.inject({
        method: 'POST',
        url: `/documentos/${docId}/aprovar`,
        headers: { authorization: `Bearer ${coord}` },
      })
      expect(dupe.statusCode).toBe(409)
      expect(JSON.parse(dupe.payload).type).toContain('documento-ja-processado')
    })

    it('403 quando USUARIO tenta aprovar', async () => {
      const user = await USER_TOKEN()
      const funcionarioId = await criarFuncionario(user)
      const docId = await uploadDoc(user, funcionarioId, 'RG')
      const res = await app.inject({
        method: 'POST',
        url: `/documentos/${docId}/aprovar`,
        headers: { authorization: `Bearer ${user}` },
      })
      expect(res.statusCode).toBe(403)
    })

    it('404 quando documento não existe', async () => {
      const coord = await COORD_TOKEN()
      const res = await app.inject({
        method: 'POST',
        url: '/documentos/000000000000000000000000/aprovar',
        headers: { authorization: `Bearer ${coord}` },
      })
      expect(res.statusCode).toBe(404)
      expect(JSON.parse(res.payload).type).toContain('documento-nao-encontrado')
    })

    it('rejeitar com motivo → 200, status REJEITADO, motivoRejeicao preenchido', async () => {
      const user = await USER_TOKEN()
      const coord = await COORD_TOKEN()
      const funcionarioId = await criarFuncionario(user)
      const docId = await uploadDoc(user, funcionarioId, 'RG')

      const res = await app.inject({
        method: 'POST',
        url: `/documentos/${docId}/rejeitar`,
        headers: { authorization: `Bearer ${coord}` },
        payload: { motivo: 'documento ilegível' },
      })
      expect(res.statusCode).toBe(200)
      const { data } = JSON.parse(res.payload) as DataEnvelope<{
        status: string
        motivoRejeicao: string
      }>
      expect(data.status).toBe('REJEITADO')
      expect(data.motivoRejeicao).toBe('documento ilegível')
    })

    it('rejeitar com motivo curto → 400 (validação Zod)', async () => {
      const user = await USER_TOKEN()
      const coord = await COORD_TOKEN()
      const funcionarioId = await criarFuncionario(user)
      const docId = await uploadDoc(user, funcionarioId, 'RG')

      const res = await app.inject({
        method: 'POST',
        url: `/documentos/${docId}/rejeitar`,
        headers: { authorization: `Bearer ${coord}` },
        payload: { motivo: 'a' },
      })
      expect(res.statusCode).toBe(400)
    })
  })

  // ─── Aprovações cadastrais ──────────────────────────────────────────────
  describe('Aprovações cadastrais (PATCH + workflow)', () => {
    async function criarFuncionario(token: string): Promise<string> {
      const res = await app.inject({
        method: 'POST',
        url: '/funcionarios',
        headers: { authorization: `Bearer ${token}` },
        payload: VALID_PAYLOAD,
      })
      return (JSON.parse(res.payload) as DataEnvelope<PublicFunc>).data.id
    }

    it('PATCH cria Aprovacao PENDENTE — não aplica direto', async () => {
      const user = await USER_TOKEN()
      const funcionarioId = await criarFuncionario(user)

      const res = await app.inject({
        method: 'PATCH',
        url: `/funcionarios/${funcionarioId}`,
        headers: { authorization: `Bearer ${user}` },
        payload: { cargo: 'Tech Lead', departamento: 'Eng' },
      })
      expect(res.statusCode).toBe(202)
      const { data } = JSON.parse(res.payload) as DataEnvelope<{
        status: string
        camposAlterados: Record<string, unknown>
      }>
      expect(data.status).toBe('PENDENTE')
      expect(data.camposAlterados).toEqual({ cargo: 'Tech Lead', departamento: 'Eng' })

      // Snapshot do funcionário NÃO mudou
      const snap = await app.inject({
        method: 'GET',
        url: `/funcionarios/${funcionarioId}`,
        headers: { authorization: `Bearer ${user}` },
      })
      const f = (JSON.parse(snap.payload) as DataEnvelope<PublicFunc>).data
      expect(f.cargo).toBe(VALID_PAYLOAD.cargo)
      expect(f.departamento).toBe(VALID_PAYLOAD.departamento)
    })

    it('PATCH sem campos editáveis → 422', async () => {
      const user = await USER_TOKEN()
      const funcionarioId = await criarFuncionario(user)
      const res = await app.inject({
        method: 'PATCH',
        url: `/funcionarios/${funcionarioId}`,
        headers: { authorization: `Bearer ${user}` },
        payload: {},
      })
      expect(res.statusCode).toBe(422)
      expect(JSON.parse(res.payload).type).toContain('sem-campos-para-alterar')
    })

    it('PATCH com COORDENADOR → 403', async () => {
      const user = await USER_TOKEN()
      const coord = await COORD_TOKEN()
      const funcionarioId = await criarFuncionario(user)
      const res = await app.inject({
        method: 'PATCH',
        url: `/funcionarios/${funcionarioId}`,
        headers: { authorization: `Bearer ${coord}` },
        payload: { cargo: 'X' },
      })
      expect(res.statusCode).toBe(403)
    })

    it('COORDENADOR aprova → aplica no funcionário e marca APROVADA', async () => {
      const user = await USER_TOKEN()
      const coord = await COORD_TOKEN()
      const funcionarioId = await criarFuncionario(user)
      const create = await app.inject({
        method: 'PATCH',
        url: `/funcionarios/${funcionarioId}`,
        headers: { authorization: `Bearer ${user}` },
        payload: { cargo: 'Tech Lead' },
      })
      const aprovId = (JSON.parse(create.payload) as DataEnvelope<{ id: string }>).data.id

      const aprov = await app.inject({
        method: 'POST',
        url: `/aprovacoes/${aprovId}/aprovar`,
        headers: { authorization: `Bearer ${coord}` },
      })
      expect(aprov.statusCode).toBe(200)
      const { data } = JSON.parse(aprov.payload) as DataEnvelope<{
        status: string
        aprovadoPor: string
      }>
      expect(data.status).toBe('APROVADA')
      expect(data.aprovadoPor).toBe('coord-1')

      const snap = await app.inject({
        method: 'GET',
        url: `/funcionarios/${funcionarioId}`,
        headers: { authorization: `Bearer ${user}` },
      })
      const f = (JSON.parse(snap.payload) as DataEnvelope<PublicFunc>).data
      expect(f.cargo).toBe('Tech Lead')
    })

    it('COORDENADOR rejeita com motivo → 200, motivoRejeicao preenchido, snapshot intacto', async () => {
      const user = await USER_TOKEN()
      const coord = await COORD_TOKEN()
      const funcionarioId = await criarFuncionario(user)
      const create = await app.inject({
        method: 'PATCH',
        url: `/funcionarios/${funcionarioId}`,
        headers: { authorization: `Bearer ${user}` },
        payload: { cargo: 'X' },
      })
      const aprovId = (JSON.parse(create.payload) as DataEnvelope<{ id: string }>).data.id

      const rej = await app.inject({
        method: 'POST',
        url: `/aprovacoes/${aprovId}/rejeitar`,
        headers: { authorization: `Bearer ${coord}` },
        payload: { motivo: 'cargo solicitado não existe' },
      })
      expect(rej.statusCode).toBe(200)
      const { data } = JSON.parse(rej.payload) as DataEnvelope<{
        status: string
        motivoRejeicao: string
      }>
      expect(data.status).toBe('REJEITADA')
      expect(data.motivoRejeicao).toBe('cargo solicitado não existe')

      const snap = await app.inject({
        method: 'GET',
        url: `/funcionarios/${funcionarioId}`,
        headers: { authorization: `Bearer ${user}` },
      })
      expect((JSON.parse(snap.payload) as DataEnvelope<PublicFunc>).data.cargo).toBe(
        VALID_PAYLOAD.cargo,
      )
    })

    it('USUARIO não pode listar aprovações (403)', async () => {
      const user = await USER_TOKEN()
      const res = await app.inject({
        method: 'GET',
        url: '/aprovacoes',
        headers: { authorization: `Bearer ${user}` },
      })
      expect(res.statusCode).toBe(403)
    })

    it('GET /aprovacoes [COORDENADOR] filtra por status', async () => {
      const user = await USER_TOKEN()
      const coord = await COORD_TOKEN()
      const f1 = await criarFuncionario(user)

      await app.inject({
        method: 'PATCH',
        url: `/funcionarios/${f1}`,
        headers: { authorization: `Bearer ${user}` },
        payload: { cargo: 'A' },
      })
      const create2 = await app.inject({
        method: 'PATCH',
        url: `/funcionarios/${f1}`,
        headers: { authorization: `Bearer ${user}` },
        payload: { cargo: 'B' },
      })
      const id2 = (JSON.parse(create2.payload) as DataEnvelope<{ id: string }>).data.id
      await app.inject({
        method: 'POST',
        url: `/aprovacoes/${id2}/aprovar`,
        headers: { authorization: `Bearer ${coord}` },
      })

      const pendentes = await app.inject({
        method: 'GET',
        url: '/aprovacoes?status=PENDENTE',
        headers: { authorization: `Bearer ${coord}` },
      })
      const list = JSON.parse(pendentes.payload) as { data: unknown[] }
      expect(list.data).toHaveLength(1)
    })

    it('PATCH em funcionário DESLIGADO → 409', async () => {
      const user = await USER_TOKEN()
      const funcionarioId = await criarFuncionario(user)
      await app.inject({
        method: 'DELETE',
        url: `/funcionarios/${funcionarioId}`,
        headers: { authorization: `Bearer ${user}` },
      })

      const res = await app.inject({
        method: 'PATCH',
        url: `/funcionarios/${funcionarioId}`,
        headers: { authorization: `Bearer ${user}` },
        payload: { cargo: 'X' },
      })
      expect(res.statusCode).toBe(409)
      expect(JSON.parse(res.payload).type).toContain('funcionario-inapto-para-alteracao')
    })

    it('aprovar inexistente → 404', async () => {
      const coord = await COORD_TOKEN()
      const res = await app.inject({
        method: 'POST',
        url: '/aprovacoes/000000000000000000000000/aprovar',
        headers: { authorization: `Bearer ${coord}` },
      })
      expect(res.statusCode).toBe(404)
      expect(JSON.parse(res.payload).type).toContain('aprovacao-nao-encontrada')
    })
  })

  // ─── /metrics ────────────────────────────────────────────────────────────
  describe('GET /metrics', () => {
    it('200 com Prometheus text format', async () => {
      await app.inject({ method: 'GET', url: '/health' })
      const res = await app.inject({ method: 'GET', url: '/metrics' })
      expect(res.statusCode).toBe(200)
      expect(res.headers['content-type']).toContain('text/plain')
      expect(res.payload).toContain('http_request_duration_seconds_count')
    })
  })
})
