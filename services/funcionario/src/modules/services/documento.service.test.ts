/**
 * Unit do DocumentoService — mocka repos e storage. Cobre:
 *   - validação de MIME e tamanho
 *   - geração de storageKey (formato esperado)
 *   - transição PENDENTE → EM_VALIDACAO no primeiro upload
 *   - no-op de transição quando funcionário já está em outro estado
 *   - 404 quando funcionário não existe
 *   - lista presigned URLs por documento
 */
import { ObjectId } from 'mongodb'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  ArquivoMuitoGrandeError,
  DocumentoJaProcessadoError,
  DocumentoNaoEncontradoError,
  FuncionarioNaoEncontradoError,
  MimeTypeNaoSuportadoError,
} from '../domain/errors/domain-error.js'
import type { Documento } from '../domain/entities/documento.js'
import type { Funcionario } from '../domain/entities/funcionario.js'
import { DocumentoService, MAX_UPLOAD_BYTES } from './documento.service.js'

function fakeFuncionario(overrides: Partial<Funcionario> = {}): Funcionario {
  const id = new ObjectId()
  const now = new Date()
  return {
    _id: id,
    codigoFun: 'FUN11144477735',
    codigoHR: 'HR0000001',
    nome: 'João Silva',
    cpf: '11144477735',
    email: 'joao@x.com',
    telefone: '1199',
    cargo: 'Dev',
    departamento: 'Tech',
    gestorId: null,
    status: 'PENDENTE',
    score: 0,
    asoValido: false,
    ctpsDigital: false,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  }
}

function fakeDocumento(funcionarioId: ObjectId, overrides: Partial<Documento> = {}): Documento {
  const id = new ObjectId()
  const now = new Date()
  return {
    _id: id,
    funcionarioId,
    tipo: 'RG',
    status: 'PENDENTE',
    storageKey: `funcionarios/${funcionarioId.toHexString()}/${id.toHexString()}.pdf`,
    nomeOriginal: 'rg.pdf',
    mimeType: 'application/pdf',
    tamanhoBytes: 100,
    enviadoPor: 'user-1',
    enviadoEm: now,
    aprovadoPor: null,
    aprovadoEm: null,
    motivoRejeicao: null,
    updatedAt: now,
    ...overrides,
  }
}

function setup(funcOverrides: Partial<Funcionario> = {}) {
  const funcionario = fakeFuncionario(funcOverrides)

  const funcionarioRepo = {
    findById: vi.fn().mockResolvedValue(funcionario),
    atualizarStatus: vi.fn().mockResolvedValue(true),
    atualizarValidacao: vi.fn().mockResolvedValue(true),
  }
  const documentoRepo = {
    create: vi
      .fn()
      .mockImplementation(async (i: { funcionarioId: ObjectId; tipo: 'RG' }) =>
        fakeDocumento(i.funcionarioId, { tipo: i.tipo }),
      ),
    findById: vi.fn(),
    listByFuncionario: vi.fn().mockResolvedValue([]),
    listarAprovadosPorTipo: vi.fn().mockResolvedValue([]),
    listarPendentesDoFuncionario: vi.fn().mockResolvedValue([]),
    aprovar: vi.fn().mockResolvedValue(true),
    rejeitar: vi.fn().mockResolvedValue(true),
  }
  const storage = {
    putObject: vi.fn().mockResolvedValue(undefined),
    getPresignedDownloadUrl: vi.fn().mockResolvedValue('https://signed/url'),
  }
  const service = new DocumentoService(documentoRepo as never, funcionarioRepo as never, storage)
  return { service, funcionario, funcionarioRepo, documentoRepo, storage }
}

const VALID_INPUT = {
  tipo: 'RG' as const,
  nomeOriginal: 'rg.pdf',
  mimeType: 'application/pdf',
  conteudo: Buffer.from('x'),
  enviadoPor: 'user-1',
}

describe('DocumentoService.upload', () => {
  beforeEach(() => vi.clearAllMocks())

  it('rejeita MIME type não suportado', async () => {
    const { service, funcionario } = setup()
    await expect(
      service.upload({
        ...VALID_INPUT,
        funcionarioId: funcionario._id.toHexString(),
        mimeType: 'application/zip',
      }),
    ).rejects.toThrow(MimeTypeNaoSuportadoError)
  })

  it('rejeita arquivo acima do limite', async () => {
    const { service, funcionario } = setup()
    await expect(
      service.upload({
        ...VALID_INPUT,
        funcionarioId: funcionario._id.toHexString(),
        conteudo: Buffer.alloc(MAX_UPLOAD_BYTES + 1),
      }),
    ).rejects.toThrow(ArquivoMuitoGrandeError)
  })

  it('lança FuncionarioNaoEncontrado se o funcionário não existe', async () => {
    const { service, funcionarioRepo } = setup()
    funcionarioRepo.findById.mockResolvedValueOnce(null)
    await expect(
      service.upload({ ...VALID_INPUT, funcionarioId: new ObjectId().toHexString() }),
    ).rejects.toThrow(FuncionarioNaoEncontradoError)
  })

  it('chama storage.putObject com key padronizada e contentType correto', async () => {
    const { service, funcionario, storage } = setup()
    await service.upload({ ...VALID_INPUT, funcionarioId: funcionario._id.toHexString() })
    expect(storage.putObject).toHaveBeenCalledTimes(1)
    const call = storage.putObject.mock.calls[0]![0] as {
      key: string
      body: Buffer
      contentType: string
    }
    expect(call.key).toMatch(
      new RegExp(`^funcionarios/${funcionario._id.toHexString()}/[a-f0-9]{24}-[\\w-]+\\.pdf$`),
    )
    expect(call.contentType).toBe('application/pdf')
  })

  it('transiciona PENDENTE → EM_VALIDACAO no primeiro upload', async () => {
    const { service, funcionario, funcionarioRepo } = setup({ status: 'PENDENTE' })
    await service.upload({ ...VALID_INPUT, funcionarioId: funcionario._id.toHexString() })
    expect(funcionarioRepo.atualizarStatus).toHaveBeenCalledWith(
      funcionario._id,
      'PENDENTE',
      'EM_VALIDACAO',
    )
  })

  it.each(['EM_VALIDACAO', 'APROVADO', 'ATIVO', 'REPROVADO'] as const)(
    'NÃO tenta transitar quando funcionário está em %s',
    async (status) => {
      const { service, funcionario, funcionarioRepo } = setup({ status })
      await service.upload({ ...VALID_INPUT, funcionarioId: funcionario._id.toHexString() })
      expect(funcionarioRepo.atualizarStatus).not.toHaveBeenCalled()
    },
  )

  it('retorna PublicDocumento com downloadUrl assinada', async () => {
    const { service, funcionario } = setup()
    const result = await service.upload({
      ...VALID_INPUT,
      funcionarioId: funcionario._id.toHexString(),
    })
    expect(result.downloadUrl).toBe('https://signed/url')
    expect(result.tipo).toBe('RG')
    expect(result.status).toBe('PENDENTE')
  })
})

describe('DocumentoService.listarPorFuncionario', () => {
  beforeEach(() => vi.clearAllMocks())

  it('lança 404 se funcionário não existe', async () => {
    const { service, funcionarioRepo } = setup()
    funcionarioRepo.findById.mockResolvedValueOnce(null)
    await expect(service.listarPorFuncionario(new ObjectId().toHexString())).rejects.toThrow(
      FuncionarioNaoEncontradoError,
    )
  })

  it('mapeia documentos com presigned URL individual por chave', async () => {
    const { service, funcionario, documentoRepo, storage } = setup()
    const d1 = fakeDocumento(funcionario._id, { storageKey: 'k1' })
    const d2 = fakeDocumento(funcionario._id, { storageKey: 'k2' })
    documentoRepo.listByFuncionario.mockResolvedValueOnce([d1, d2])
    storage.getPresignedDownloadUrl
      .mockResolvedValueOnce('https://signed/k1')
      .mockResolvedValueOnce('https://signed/k2')

    const list = await service.listarPorFuncionario(funcionario._id.toHexString())
    expect(list).toHaveLength(2)
    expect(list[0]!.downloadUrl).toBe('https://signed/k1')
    expect(list[1]!.downloadUrl).toBe('https://signed/k2')
    expect(storage.getPresignedDownloadUrl).toHaveBeenNthCalledWith(1, 'k1')
    expect(storage.getPresignedDownloadUrl).toHaveBeenNthCalledWith(2, 'k2')
  })
})

describe('DocumentoService.buscarParaProcessar', () => {
  beforeEach(() => vi.clearAllMocks())

  it('lança 404 se documento não existe', async () => {
    const { service, documentoRepo } = setup()
    documentoRepo.findById.mockResolvedValueOnce(null)
    await expect(service.buscarParaProcessar(new ObjectId().toHexString())).rejects.toThrow(
      DocumentoNaoEncontradoError,
    )
  })

  it.each(['APROVADO', 'REJEITADO'] as const)(
    'lança 409 se documento já está em %s',
    async (status) => {
      const { service, funcionario, documentoRepo } = setup()
      documentoRepo.findById.mockResolvedValueOnce(fakeDocumento(funcionario._id, { status }))
      await expect(service.buscarParaProcessar(new ObjectId().toHexString())).rejects.toThrow(
        DocumentoJaProcessadoError,
      )
    },
  )

  it('retorna ids quando documento está PENDENTE', async () => {
    const { service, funcionario, documentoRepo } = setup()
    const doc = fakeDocumento(funcionario._id, { status: 'PENDENTE' })
    documentoRepo.findById.mockResolvedValueOnce(doc)
    const result = await service.buscarParaProcessar(doc._id.toHexString())
    expect(result.id.equals(doc._id)).toBe(true)
    expect(result.funcionarioId.equals(funcionario._id)).toBe(true)
  })
})

describe('DocumentoService.aprovar (com score + ativação automática)', () => {
  beforeEach(() => vi.clearAllMocks())

  function todosOsTipos(funcionarioId: ObjectId) {
    return (
      ['RG', 'CPF', 'CTPS_DIGITAL', 'ASO_ADMISSIONAL', 'PIS', 'COMPROVANTE_ENDERECO'] as const
    ).map((tipo) => fakeDocumento(funcionarioId, { tipo, status: 'APROVADO' }))
  }

  it('aprovação parcial → atualiza validação sem promover status', async () => {
    const { service, funcionario, documentoRepo, funcionarioRepo } = setup({
      status: 'EM_VALIDACAO',
    })
    const doc = fakeDocumento(funcionario._id, { status: 'PENDENTE', tipo: 'RG' })
    documentoRepo.findById.mockResolvedValueOnce(doc) // buscarParaProcessar
    // Após aprovar, só o RG está APROVADO
    documentoRepo.listarAprovadosPorTipo.mockResolvedValueOnce([
      fakeDocumento(funcionario._id, { tipo: 'RG', status: 'APROVADO' }),
    ])
    documentoRepo.findById.mockResolvedValueOnce(
      fakeDocumento(funcionario._id, { status: 'APROVADO', tipo: 'RG' }),
    )

    const result = await service.aprovar(doc._id.toHexString(), 'coord-1')

    expect(funcionarioRepo.atualizarValidacao).toHaveBeenCalledWith(funcionario._id, {
      score: 10,
      asoValido: false,
      ctpsDigital: false,
    })
    expect(funcionarioRepo.atualizarStatus).not.toHaveBeenCalled()
    expect(result.status).toBe('APROVADO')
  })

  it('aprovação que completa eSocial → promove EM_VALIDACAO → APROVADO → ATIVO', async () => {
    const { service, funcionario, documentoRepo, funcionarioRepo } = setup({
      status: 'EM_VALIDACAO',
    })
    const doc = fakeDocumento(funcionario._id, {
      status: 'PENDENTE',
      tipo: 'COMPROVANTE_ENDERECO',
    })
    documentoRepo.findById.mockResolvedValueOnce(doc) // buscarParaProcessar
    documentoRepo.listarAprovadosPorTipo.mockResolvedValueOnce(todosOsTipos(funcionario._id))
    // findById dentro de recalcularValidacaoEEventualPromocao
    funcionarioRepo.findById.mockResolvedValueOnce({
      ...funcionario,
      status: 'EM_VALIDACAO',
    })
    documentoRepo.findById.mockResolvedValueOnce(
      fakeDocumento(funcionario._id, { status: 'APROVADO' }),
    )

    await service.aprovar(doc._id.toHexString(), 'coord-1')

    expect(funcionarioRepo.atualizarValidacao).toHaveBeenCalledWith(funcionario._id, {
      score: 100,
      asoValido: true,
      ctpsDigital: true,
    })
    expect(funcionarioRepo.atualizarStatus).toHaveBeenNthCalledWith(
      1,
      funcionario._id,
      'EM_VALIDACAO',
      'APROVADO',
    )
    expect(funcionarioRepo.atualizarStatus).toHaveBeenNthCalledWith(
      2,
      funcionario._id,
      'APROVADO',
      'ATIVO',
    )
  })

  it('não promove se funcionário não está mais em EM_VALIDACAO (race)', async () => {
    const { service, funcionario, documentoRepo, funcionarioRepo } = setup()
    const doc = fakeDocumento(funcionario._id, { status: 'PENDENTE' })
    documentoRepo.findById.mockResolvedValueOnce(doc)
    documentoRepo.listarAprovadosPorTipo.mockResolvedValueOnce(todosOsTipos(funcionario._id))
    // Funcionário já está ATIVO (outro fluxo promoveu antes)
    funcionarioRepo.findById.mockResolvedValueOnce({ ...funcionario, status: 'ATIVO' })
    documentoRepo.findById.mockResolvedValueOnce(
      fakeDocumento(funcionario._id, { status: 'APROVADO' }),
    )

    await service.aprovar(doc._id.toHexString(), 'coord-1')
    expect(funcionarioRepo.atualizarStatus).not.toHaveBeenCalled()
  })

  it('aprovar lança 409 quando outro processo aprovou primeiro (race no UPDATE)', async () => {
    const { service, funcionario, documentoRepo } = setup({ status: 'EM_VALIDACAO' })
    const doc = fakeDocumento(funcionario._id, { status: 'PENDENTE' })
    documentoRepo.findById.mockResolvedValueOnce(doc)
    documentoRepo.aprovar.mockResolvedValueOnce(false) // outro request ganhou

    await expect(service.aprovar(doc._id.toHexString(), 'coord-1')).rejects.toThrow(
      DocumentoJaProcessadoError,
    )
  })
})

describe('DocumentoService.aprovarPendentesDoFuncionario', () => {
  beforeEach(() => vi.clearAllMocks())

  function todosOsTipos(funcionarioId: ObjectId) {
    return (
      ['RG', 'CPF', 'CTPS_DIGITAL', 'ASO_ADMISSIONAL', 'PIS', 'COMPROVANTE_ENDERECO'] as const
    ).map((tipo) => fakeDocumento(funcionarioId, { tipo, status: 'APROVADO' }))
  }

  it('lança 404 se funcionário não existe', async () => {
    const { service, funcionarioRepo } = setup()
    funcionarioRepo.findById.mockResolvedValueOnce(null)
    await expect(
      service.aprovarPendentesDoFuncionario(new ObjectId().toHexString(), 'coord'),
    ).rejects.toThrow(FuncionarioNaoEncontradoError)
  })

  it('aprovados=0 quando não há pendentes (idempotente)', async () => {
    const { service, funcionario, documentoRepo, funcionarioRepo } = setup({
      status: 'ATIVO',
    })
    documentoRepo.listarPendentesDoFuncionario.mockResolvedValueOnce([])
    documentoRepo.listarAprovadosPorTipo.mockResolvedValueOnce([])
    funcionarioRepo.findById
      .mockResolvedValueOnce(funcionario) // entrada
      .mockResolvedValueOnce(funcionario) // snapshot final

    const r = await service.aprovarPendentesDoFuncionario(funcionario._id.toHexString(), 'coord')
    expect(r.aprovados).toBe(0)
    expect(r.statusFuncionario).toBe('ATIVO')
    expect(documentoRepo.aprovar).not.toHaveBeenCalled()
  })

  it('chama repo.aprovar para cada pendente e conta apenas os vencidos', async () => {
    const { service, funcionario, documentoRepo, funcionarioRepo } = setup({
      status: 'EM_VALIDACAO',
    })
    const pendentes = [
      fakeDocumento(funcionario._id, { status: 'PENDENTE', tipo: 'RG' }),
      fakeDocumento(funcionario._id, { status: 'PENDENTE', tipo: 'CPF' }),
      fakeDocumento(funcionario._id, { status: 'PENDENTE', tipo: 'PIS' }),
    ]
    documentoRepo.listarPendentesDoFuncionario.mockResolvedValueOnce(pendentes)
    // O segundo doc perde a race (outro coordenador aprovou antes)
    documentoRepo.aprovar
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true)
    documentoRepo.listarAprovadosPorTipo.mockResolvedValueOnce([])
    funcionarioRepo.findById.mockResolvedValueOnce(funcionario).mockResolvedValueOnce(funcionario)

    const r = await service.aprovarPendentesDoFuncionario(funcionario._id.toHexString(), 'coord-1')
    expect(documentoRepo.aprovar).toHaveBeenCalledTimes(3)
    expect(r.aprovados).toBe(2)
  })

  it('quando aprovar todos completa eSocial → promove para ATIVO', async () => {
    const { service, funcionario, documentoRepo, funcionarioRepo } = setup({
      status: 'EM_VALIDACAO',
    })
    const pendentes = (
      ['RG', 'CPF', 'CTPS_DIGITAL', 'ASO_ADMISSIONAL', 'PIS', 'COMPROVANTE_ENDERECO'] as const
    ).map((t) => fakeDocumento(funcionario._id, { status: 'PENDENTE', tipo: t }))
    documentoRepo.listarPendentesDoFuncionario.mockResolvedValueOnce(pendentes)
    documentoRepo.listarAprovadosPorTipo.mockResolvedValueOnce(todosOsTipos(funcionario._id))
    funcionarioRepo.findById
      .mockResolvedValueOnce(funcionario) // entrada
      .mockResolvedValueOnce({ ...funcionario, status: 'EM_VALIDACAO' }) // dentro do recalcular
      .mockResolvedValueOnce({
        ...funcionario,
        status: 'ATIVO',
        score: 100,
        asoValido: true,
        ctpsDigital: true,
      }) // snapshot final

    const r = await service.aprovarPendentesDoFuncionario(funcionario._id.toHexString(), 'coord-1')
    expect(r.aprovados).toBe(6)
    expect(r.score).toBe(100)
    expect(r.asoValido).toBe(true)
    expect(r.ctpsDigital).toBe(true)
    expect(r.statusFuncionario).toBe('ATIVO')
    expect(funcionarioRepo.atualizarStatus).toHaveBeenNthCalledWith(
      1,
      funcionario._id,
      'EM_VALIDACAO',
      'APROVADO',
    )
    expect(funcionarioRepo.atualizarStatus).toHaveBeenNthCalledWith(
      2,
      funcionario._id,
      'APROVADO',
      'ATIVO',
    )
  })
})

describe('DocumentoService.rejeitar', () => {
  beforeEach(() => vi.clearAllMocks())

  it('rejeitar marca status, propaga motivo e recalcula score', async () => {
    const { service, funcionario, documentoRepo, funcionarioRepo } = setup({
      status: 'EM_VALIDACAO',
    })
    const doc = fakeDocumento(funcionario._id, { status: 'PENDENTE', tipo: 'RG' })
    documentoRepo.findById.mockResolvedValueOnce(doc)
    documentoRepo.listarAprovadosPorTipo.mockResolvedValueOnce([])
    documentoRepo.findById.mockResolvedValueOnce(
      fakeDocumento(funcionario._id, { status: 'REJEITADO', motivoRejeicao: 'inválido' }),
    )

    const out = await service.rejeitar(doc._id.toHexString(), 'coord-1', 'inválido')

    expect(documentoRepo.rejeitar).toHaveBeenCalledWith(doc._id, 'coord-1', 'inválido')
    expect(funcionarioRepo.atualizarValidacao).toHaveBeenCalled()
    expect(funcionarioRepo.atualizarStatus).not.toHaveBeenCalled() // score voltou a 0
    expect(out.status).toBe('REJEITADO')
    expect(out.motivoRejeicao).toBe('inválido')
  })
})
