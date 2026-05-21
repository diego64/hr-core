/**
 * Unit do AprovacaoService — mocka repos. Cobre:
 *   - rejeita 422 quando nenhum campo é informado
 *   - rejeita 409 quando funcionário inapto (DESLIGADO/REPROVADO/INATIVO)
 *   - rejeita 404 quando funcionário não existe
 *   - cria Aprovacao PENDENTE com payload filtrado
 *   - aprovar valida funcionário, marca aprovacao e aplica payload no funcionario
 *   - aprovar lança 409 em race (atualizarStatus retorna false)
 *   - rejeitar grava motivo
 */
import { ObjectId } from 'mongodb'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  AprovacaoJaProcessadaError,
  AprovacaoNaoEncontradaError,
  FuncionarioInaptoParaAlteracaoError,
  FuncionarioNaoEncontradoError,
  SemCamposParaAlterarError,
} from '../domain/errors/domain-error.js'
import type { Aprovacao } from '../domain/entities/aprovacao.js'
import type { Funcionario, FuncionarioStatus } from '../domain/entities/funcionario.js'
import { AprovacaoService } from './aprovacao.service.js'

function fakeFunc(status: FuncionarioStatus = 'ATIVO'): Funcionario {
  const id = new ObjectId()
  const now = new Date()
  return {
    _id: id,
    codigoFun: 'FUN1',
    codigoHR: 'HR1',
    nome: 'X',
    cpf: '11144477735',
    email: 'x@x.com',
    telefone: '11',
    cargo: 'Dev',
    departamento: 'Tech',
    gestorId: null,
    status,
    score: 100,
    asoValido: true,
    ctpsDigital: true,
    createdAt: now,
    updatedAt: now,
  }
}

function fakeAprovacao(funcionarioId: ObjectId, overrides: Partial<Aprovacao> = {}): Aprovacao {
  const id = new ObjectId()
  const now = new Date()
  return {
    _id: id,
    funcionarioId,
    tipo: 'ALTERACAO_CADASTRAL',
    status: 'PENDENTE',
    camposAlterados: { cargo: 'Tech Lead' },
    solicitadoPor: 'user-1',
    solicitadoEm: now,
    aprovadoPor: null,
    aprovadoEm: null,
    motivoRejeicao: null,
    updatedAt: now,
    ...overrides,
  }
}

function setup(status: FuncionarioStatus = 'ATIVO') {
  const funcionario = fakeFunc(status)
  const funcionarioRepo = {
    findById: vi.fn().mockResolvedValue(funcionario),
    atualizarCampos: vi.fn().mockResolvedValue(true),
  }
  const aprovacaoRepo = {
    create: vi
      .fn()
      .mockImplementation(async (i: { funcionarioId: ObjectId; camposAlterados: object }) =>
        fakeAprovacao(i.funcionarioId, { camposAlterados: i.camposAlterados }),
      ),
    findById: vi.fn(),
    list: vi.fn().mockResolvedValue([]),
    aprovar: vi.fn().mockResolvedValue(true),
    rejeitar: vi.fn().mockResolvedValue(true),
  }
  const service = new AprovacaoService(aprovacaoRepo as never, funcionarioRepo as never)
  return { service, funcionario, funcionarioRepo, aprovacaoRepo }
}

describe('AprovacaoService.solicitar', () => {
  beforeEach(() => vi.clearAllMocks())

  it('lança 422 quando nenhum campo informado', async () => {
    const { service } = setup()
    await expect(
      service.solicitar({
        funcionarioId: new ObjectId().toHexString(),
        camposAlterados: {},
        solicitadoPor: 'user-1',
      }),
    ).rejects.toThrow(SemCamposParaAlterarError)
  })

  it('lança 404 quando funcionário não existe', async () => {
    const { service, funcionarioRepo } = setup()
    funcionarioRepo.findById.mockResolvedValueOnce(null)
    await expect(
      service.solicitar({
        funcionarioId: new ObjectId().toHexString(),
        camposAlterados: { cargo: 'X' },
        solicitadoPor: 'u',
      }),
    ).rejects.toThrow(FuncionarioNaoEncontradoError)
  })

  it.each(['DESLIGADO', 'REPROVADO', 'INATIVO'] as const)(
    'lança 409 quando funcionário está em %s',
    async (status) => {
      const { service, funcionario } = setup(status)
      await expect(
        service.solicitar({
          funcionarioId: funcionario._id.toHexString(),
          camposAlterados: { cargo: 'X' },
          solicitadoPor: 'u',
        }),
      ).rejects.toThrow(FuncionarioInaptoParaAlteracaoError)
    },
  )

  it('cria Aprovacao com apenas os campos definidos (filtra undefined)', async () => {
    const { service, funcionario, aprovacaoRepo } = setup()
    await service.solicitar({
      funcionarioId: funcionario._id.toHexString(),
      camposAlterados: { cargo: 'X', telefone: undefined, departamento: 'Tech' },
      solicitadoPor: 'u',
    })
    const call = aprovacaoRepo.create.mock.calls[0]![0] as {
      camposAlterados: Record<string, unknown>
    }
    expect(call.camposAlterados).toEqual({ cargo: 'X', departamento: 'Tech' })
  })

  it('permite gestorId = null (clear)', async () => {
    const { service, funcionario, aprovacaoRepo } = setup()
    await service.solicitar({
      funcionarioId: funcionario._id.toHexString(),
      camposAlterados: { gestorId: null },
      solicitadoPor: 'u',
    })
    const call = aprovacaoRepo.create.mock.calls[0]![0] as {
      camposAlterados: Record<string, unknown>
    }
    expect(call.camposAlterados).toEqual({ gestorId: null })
  })
})

describe('AprovacaoService.aprovar', () => {
  beforeEach(() => vi.clearAllMocks())

  it('lança 404 se Aprovacao não existe', async () => {
    const { service, aprovacaoRepo } = setup()
    aprovacaoRepo.findById.mockResolvedValueOnce(null)
    await expect(service.aprovar('x', 'c')).rejects.toThrow(AprovacaoNaoEncontradaError)
  })

  it.each(['APROVADA', 'REJEITADA'] as const)(
    'lança 409 quando Aprovacao está em %s',
    async (status) => {
      const { service, funcionario, aprovacaoRepo } = setup()
      aprovacaoRepo.findById.mockResolvedValueOnce(fakeAprovacao(funcionario._id, { status }))
      await expect(service.aprovar('x', 'c')).rejects.toThrow(AprovacaoJaProcessadaError)
    },
  )

  it('re-valida funcionário no momento da aprovação (pode ter mudado de status)', async () => {
    const { service, funcionario, funcionarioRepo, aprovacaoRepo } = setup('ATIVO')
    aprovacaoRepo.findById.mockResolvedValueOnce(fakeAprovacao(funcionario._id))
    funcionarioRepo.findById.mockResolvedValueOnce({ ...funcionario, status: 'DESLIGADO' })
    await expect(service.aprovar('x', 'c')).rejects.toThrow(FuncionarioInaptoParaAlteracaoError)
  })

  it('aplica payload no funcionário e marca Aprovacao APROVADA', async () => {
    const { service, funcionario, funcionarioRepo, aprovacaoRepo } = setup()
    const aprov = fakeAprovacao(funcionario._id, {
      camposAlterados: { cargo: 'Tech Lead', departamento: 'Eng' },
    })
    aprovacaoRepo.findById
      .mockResolvedValueOnce(aprov) // primeira leitura
      .mockResolvedValueOnce({ ...aprov, status: 'APROVADA', aprovadoPor: 'coord-1' })

    const result = await service.aprovar('x', 'coord-1')

    expect(aprovacaoRepo.aprovar).toHaveBeenCalledWith(aprov._id, 'coord-1')
    expect(funcionarioRepo.atualizarCampos).toHaveBeenCalledWith(funcionario._id, {
      cargo: 'Tech Lead',
      departamento: 'Eng',
    })
    expect(result.status).toBe('APROVADA')
  })

  it('lança 409 se outro coordenador aprovou primeiro (race)', async () => {
    const { service, funcionario, aprovacaoRepo } = setup()
    aprovacaoRepo.findById.mockResolvedValueOnce(fakeAprovacao(funcionario._id))
    aprovacaoRepo.aprovar.mockResolvedValueOnce(false)
    await expect(service.aprovar('x', 'c')).rejects.toThrow(AprovacaoJaProcessadaError)
  })
})

describe('AprovacaoService.rejeitar', () => {
  beforeEach(() => vi.clearAllMocks())

  it('grava motivo no repo + marca REJEITADA', async () => {
    const { service, funcionario, aprovacaoRepo } = setup()
    const aprov = fakeAprovacao(funcionario._id)
    aprovacaoRepo.findById
      .mockResolvedValueOnce(aprov)
      .mockResolvedValueOnce({ ...aprov, status: 'REJEITADA', motivoRejeicao: 'dados inválidos' })

    const out = await service.rejeitar('x', 'coord-1', 'dados inválidos')
    expect(aprovacaoRepo.rejeitar).toHaveBeenCalledWith(aprov._id, 'coord-1', 'dados inválidos')
    expect(out.status).toBe('REJEITADA')
    expect(out.motivoRejeicao).toBe('dados inválidos')
  })
})
