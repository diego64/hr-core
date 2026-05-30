import { describe, expect, it } from 'vitest'

import {
  FakeAuditoriaRepository,
  FakeAvaliacaoRepository,
  FakeAvaliadorRepository,
  FakeContadorRepository,
  FakeFuncionarioCacheRepository,
} from '../../../test/fakes.js'
import { InMemoryEventPublisher } from '../../../test/in-memory-event-publisher.js'
import {
  AvaliacaoNaoEncontradaError,
  AvaliadorInativoError,
  AvaliadorNaoEncontradoError,
  ComentarioInvalidoError,
  EdicaoNaoAutorizadaError,
  FuncionarioInativoError,
  FuncionarioNaoEncontradoError,
  NotaInvalidaError,
  SetorNaoAutorizadoError,
  TituloInvalidoError,
} from '../domain/errors/domain-error.js'
import type { AvaliacaoRepository } from '../repositories/avaliacao.repository.js'
import type { AvaliadorRepository } from '../repositories/avaliador.repository.js'
import type { ContadorRepository } from '../repositories/contador.repository.js'
import type { FuncionarioCacheRepository } from '../repositories/funcionario-cache.repository.js'
import type { AuditoriaRepository } from '../repositories/auditoria.repository.js'
import { AuditoriaService } from './auditoria.service.js'
import { AvaliacaoService } from './avaliacao.service.js'

interface Harness {
  service: AvaliacaoService
  avaliadorRepo: FakeAvaliadorRepository
  funcionarioRepo: FakeFuncionarioCacheRepository
  avaliacaoRepo: FakeAvaliacaoRepository
  contadorRepo: FakeContadorRepository
  events: InMemoryEventPublisher
  auditoriaRepo: FakeAuditoriaRepository
}

function buildHarness(): Harness {
  const auditoriaRepo = new FakeAuditoriaRepository()
  const avaliadorRepo = new FakeAvaliadorRepository()
  const funcionarioRepo = new FakeFuncionarioCacheRepository()
  const avaliacaoRepo = new FakeAvaliacaoRepository()
  const contadorRepo = new FakeContadorRepository()
  const events = new InMemoryEventPublisher()

  const auditoria = new AuditoriaService(auditoriaRepo as unknown as AuditoriaRepository)
  const service = new AvaliacaoService(
    avaliacaoRepo as unknown as AvaliacaoRepository,
    avaliadorRepo as unknown as AvaliadorRepository,
    funcionarioRepo as unknown as FuncionarioCacheRepository,
    contadorRepo as unknown as ContadorRepository,
    auditoria,
    events,
  )
  return {
    service,
    avaliadorRepo,
    funcionarioRepo,
    avaliacaoRepo,
    contadorRepo,
    events,
    auditoriaRepo,
  }
}

async function setupAvaliadorEFuncionario(
  h: Harness,
  setor = 'Tecnologia',
): Promise<{
  avaliadorUsuarioId: string
  codigoFun: string
}> {
  const avaliadorUsuarioId = 'user-avaliador-1'
  await h.avaliadorRepo.create({
    usuarioId: avaliadorUsuarioId,
    nome: 'Diana Reis',
    email: 'diana@hr-core.local',
    setor,
    criadoPor: 'admin-1',
  })
  await h.funcionarioRepo.upsert({
    _id: 'func-1',
    codigoFun: 'FUN11144477735',
    nome: 'Ana Lima',
    setor,
    ativo: true,
  })
  return { avaliadorUsuarioId, codigoFun: 'FUN11144477735' }
}

const COMENTARIO_OK =
  'Demonstrou excelente capacidade técnica e colaboração com a equipe ao longo do período.'

describe('AvaliacaoService.criar', () => {
  it('cria avaliação para funcionário do próprio setor — gera AVAL sequencial + evento', async () => {
    const h = buildHarness()
    const { avaliadorUsuarioId, codigoFun } = await setupAvaliadorEFuncionario(h)

    const result = await h.service.criar({
      avaliadorUsuarioId,
      codigoFun,
      titulo: 'Avaliação Q1 2026',
      comentario: COMENTARIO_OK,
      nota: 5,
      ip: '10.0.0.1',
      userAgent: 'test',
    })

    expect(result.codigo).toBe('AVAL000001')
    expect(result.nota).toBe(5)
    expect(result.setor).toBe('Tecnologia')
    expect(h.events.events).toHaveLength(1)
    expect(h.events.events[0]?.eventType).toBe('AvaliacaoCriada')
    expect(h.auditoriaRepo.docs).toHaveLength(1)
    expect(h.auditoriaRepo.docs[0]?.acao).toBe('AVALIACAO_CRIADA')
  })

  it('rejeita 403 quando funcionário está em outro setor', async () => {
    const h = buildHarness()
    const { avaliadorUsuarioId } = await setupAvaliadorEFuncionario(h, 'Tecnologia')
    await h.funcionarioRepo.upsert({
      _id: 'func-2',
      codigoFun: 'FUN12345678909',
      nome: 'Carla Dias',
      setor: 'Financeiro',
      ativo: true,
    })

    await expect(
      h.service.criar({
        avaliadorUsuarioId,
        codigoFun: 'FUN12345678909',
        titulo: 'Tentativa fora do setor',
        comentario: COMENTARIO_OK,
        nota: 3,
        ip: null,
        userAgent: null,
      }),
    ).rejects.toBeInstanceOf(SetorNaoAutorizadoError)
  })

  it('rejeita 422 quando funcionário está inativo (desligado)', async () => {
    const h = buildHarness()
    const { avaliadorUsuarioId, codigoFun } = await setupAvaliadorEFuncionario(h)
    await h.funcionarioRepo.marcarInativo('func-1')

    await expect(
      h.service.criar({
        avaliadorUsuarioId,
        codigoFun,
        titulo: 'Pós-desligamento',
        comentario: COMENTARIO_OK,
        nota: 3,
        ip: null,
        userAgent: null,
      }),
    ).rejects.toBeInstanceOf(FuncionarioInativoError)
  })

  it('rejeita 404 quando o funcionário não está no cache', async () => {
    const h = buildHarness()
    await setupAvaliadorEFuncionario(h)

    await expect(
      h.service.criar({
        avaliadorUsuarioId: 'user-avaliador-1',
        codigoFun: 'FUN99999999999',
        titulo: 'Funcionário fantasma',
        comentario: COMENTARIO_OK,
        nota: 3,
        ip: null,
        userAgent: null,
      }),
    ).rejects.toBeInstanceOf(FuncionarioNaoEncontradoError)
  })

  it('rejeita 403 quando avaliador está desativado', async () => {
    const h = buildHarness()
    const { avaliadorUsuarioId, codigoFun } = await setupAvaliadorEFuncionario(h)
    const avaliador = await h.avaliadorRepo.findByUsuarioId(avaliadorUsuarioId)
    await h.avaliadorRepo.desativar(avaliador!._id.toHexString())

    await expect(
      h.service.criar({
        avaliadorUsuarioId,
        codigoFun,
        titulo: 'Tentativa desativado',
        comentario: COMENTARIO_OK,
        nota: 3,
        ip: null,
        userAgent: null,
      }),
    ).rejects.toBeInstanceOf(AvaliadorInativoError)
  })

  it('rejeita 404 quando avaliador não existe', async () => {
    const h = buildHarness()
    await h.funcionarioRepo.upsert({
      _id: 'f',
      codigoFun: 'FUN11144477735',
      nome: 'x',
      setor: 'Tecnologia',
      ativo: true,
    })

    await expect(
      h.service.criar({
        avaliadorUsuarioId: 'inexistente',
        codigoFun: 'FUN11144477735',
        titulo: 'sem avaliador',
        comentario: COMENTARIO_OK,
        nota: 1,
        ip: null,
        userAgent: null,
      }),
    ).rejects.toBeInstanceOf(AvaliadorNaoEncontradoError)
  })

  it('rejeita 422 quando nota fora do intervalo 1-5', async () => {
    const h = buildHarness()
    const { avaliadorUsuarioId, codigoFun } = await setupAvaliadorEFuncionario(h)

    await expect(
      h.service.criar({
        avaliadorUsuarioId,
        codigoFun,
        titulo: 'Nota inválida',
        comentario: COMENTARIO_OK,
        nota: 6,
        ip: null,
        userAgent: null,
      }),
    ).rejects.toBeInstanceOf(NotaInvalidaError)
  })

  it('rejeita 422 quando título abaixo do mínimo', async () => {
    const h = buildHarness()
    const { avaliadorUsuarioId, codigoFun } = await setupAvaliadorEFuncionario(h)

    await expect(
      h.service.criar({
        avaliadorUsuarioId,
        codigoFun,
        titulo: 'abc',
        comentario: COMENTARIO_OK,
        nota: 3,
        ip: null,
        userAgent: null,
      }),
    ).rejects.toBeInstanceOf(TituloInvalidoError)
  })

  it('rejeita 422 quando comentário abaixo do mínimo', async () => {
    const h = buildHarness()
    const { avaliadorUsuarioId, codigoFun } = await setupAvaliadorEFuncionario(h)

    await expect(
      h.service.criar({
        avaliadorUsuarioId,
        codigoFun,
        titulo: 'Título adequado',
        comentario: 'curto',
        nota: 3,
        ip: null,
        userAgent: null,
      }),
    ).rejects.toBeInstanceOf(ComentarioInvalidoError)
  })
})

describe('AvaliacaoService.editar', () => {
  it('AVALIADOR dono edita própria avaliação', async () => {
    const h = buildHarness()
    const { avaliadorUsuarioId, codigoFun } = await setupAvaliadorEFuncionario(h)
    const criada = await h.service.criar({
      avaliadorUsuarioId,
      codigoFun,
      titulo: 'Versão 1',
      comentario: COMENTARIO_OK,
      nota: 3,
      ip: null,
      userAgent: null,
    })

    const editada = await h.service.editar({
      id: criada.id,
      editorUsuarioId: avaliadorUsuarioId,
      editorEhAdmin: false,
      nota: 5,
      ip: null,
      userAgent: null,
    })

    expect(editada.nota).toBe(5)
    expect(editada.titulo).toBe('Versão 1')
  })

  it('AVALIADOR não-dono recebe 403', async () => {
    const h = buildHarness()
    const { avaliadorUsuarioId, codigoFun } = await setupAvaliadorEFuncionario(h)
    const criada = await h.service.criar({
      avaliadorUsuarioId,
      codigoFun,
      titulo: 'Original',
      comentario: COMENTARIO_OK,
      nota: 3,
      ip: null,
      userAgent: null,
    })

    await h.avaliadorRepo.create({
      usuarioId: 'outro-avaliador',
      nome: 'Outro',
      email: 'o@hr-core.local',
      setor: 'Tecnologia',
      criadoPor: 'admin',
    })

    await expect(
      h.service.editar({
        id: criada.id,
        editorUsuarioId: 'outro-avaliador',
        editorEhAdmin: false,
        nota: 1,
        ip: null,
        userAgent: null,
      }),
    ).rejects.toBeInstanceOf(EdicaoNaoAutorizadaError)
  })

  it('ADMINISTRADOR edita avaliação de qualquer avaliador', async () => {
    const h = buildHarness()
    const { avaliadorUsuarioId, codigoFun } = await setupAvaliadorEFuncionario(h)
    const criada = await h.service.criar({
      avaliadorUsuarioId,
      codigoFun,
      titulo: 'Original',
      comentario: COMENTARIO_OK,
      nota: 3,
      ip: null,
      userAgent: null,
    })

    const editada = await h.service.editar({
      id: criada.id,
      editorUsuarioId: 'admin-qualquer',
      editorEhAdmin: true,
      titulo: 'Editado pelo admin via correção',
      ip: null,
      userAgent: null,
    })

    expect(editada.titulo).toBe('Editado pelo admin via correção')
  })

  it('404 quando id não existe', async () => {
    const h = buildHarness()
    await expect(
      h.service.editar({
        id: '6a000000000000000000000a',
        editorUsuarioId: 'qualquer',
        editorEhAdmin: true,
        nota: 5,
        ip: null,
        userAgent: null,
      }),
    ).rejects.toBeInstanceOf(AvaliacaoNaoEncontradaError)
  })
})

describe('AvaliacaoService.buscar/listar', () => {
  it('busca por código', async () => {
    const h = buildHarness()
    const { avaliadorUsuarioId, codigoFun } = await setupAvaliadorEFuncionario(h)
    await h.service.criar({
      avaliadorUsuarioId,
      codigoFun,
      titulo: 'Avaliação Semestral',
      comentario: COMENTARIO_OK,
      nota: 4,
      ip: null,
      userAgent: null,
    })

    const result = await h.service.buscarPorCodigo('AVAL000001')
    expect(result.codigo).toBe('AVAL000001')
    expect(result.nota).toBe(4)
  })

  it('lista paginado por funcionário', async () => {
    const h = buildHarness()
    const { avaliadorUsuarioId, codigoFun } = await setupAvaliadorEFuncionario(h)
    for (let i = 0; i < 3; i++) {
      await h.service.criar({
        avaliadorUsuarioId,
        codigoFun,
        titulo: `Avaliação número ${i + 1}`,
        comentario: COMENTARIO_OK,
        nota: 3,
        ip: null,
        userAgent: null,
      })
    }

    const result = await h.service.listar({
      filtros: { codigoFun },
      page: 1,
      limit: 2,
    })
    expect(result.total).toBe(3)
    expect(result.pages).toBe(2)
    expect(result.items).toHaveLength(2)
  })
})
