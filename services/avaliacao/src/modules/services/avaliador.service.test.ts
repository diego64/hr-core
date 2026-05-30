import { describe, expect, it } from 'vitest'

import { FakeAuditoriaRepository, FakeAvaliadorRepository } from '../../../test/fakes.js'
import { InMemoryEventPublisher } from '../../../test/in-memory-event-publisher.js'
import {
  AvaliadorJaExistenteError,
  AvaliadorNaoEncontradoError,
  SetorInvalidoError,
} from '../domain/errors/domain-error.js'
import type { AuditoriaRepository } from '../repositories/auditoria.repository.js'
import type { AvaliadorRepository } from '../repositories/avaliador.repository.js'
import { AuditoriaService } from './auditoria.service.js'
import { AvaliadorService } from './avaliador.service.js'

function build() {
  const repo = new FakeAvaliadorRepository()
  const auditoriaRepo = new FakeAuditoriaRepository()
  const events = new InMemoryEventPublisher()
  const auditoria = new AuditoriaService(auditoriaRepo as unknown as AuditoriaRepository)
  const service = new AvaliadorService(repo as unknown as AvaliadorRepository, auditoria, events)
  return { service, repo, events, auditoriaRepo }
}

describe('AvaliadorService.criar', () => {
  it('cria avaliador com setor normalizado e publica evento', async () => {
    const { service, repo, events } = build()
    const result = await service.criar({
      usuarioId: 'u-1',
      nome: 'Diana Reis',
      email: '  DIANA@hr-core.local  ',
      setor: '   Tecnologia   ',
      criadoPor: 'admin-1',
      ip: '10.0.0.1',
      userAgent: 'test',
    })

    expect(result.setor).toBe('Tecnologia')
    expect(result.email).toBe('diana@hr-core.local')
    expect(result.ativo).toBe(true)
    expect(repo.docs.size).toBe(1)
    expect(events.events[0]?.eventType).toBe('AvaliadorCriado')
  })

  it('rejeita 409 se já existe avaliador para o usuarioId', async () => {
    const { service } = build()
    await service.criar({
      usuarioId: 'u-dup',
      nome: 'Diana',
      email: 'd@hr-core.local',
      setor: 'Tecnologia',
      criadoPor: 'admin-1',
      ip: null,
      userAgent: null,
    })

    await expect(
      service.criar({
        usuarioId: 'u-dup',
        nome: 'Diana 2',
        email: 'd2@hr-core.local',
        setor: 'Financeiro',
        criadoPor: 'admin-1',
        ip: null,
        userAgent: null,
      }),
    ).rejects.toBeInstanceOf(AvaliadorJaExistenteError)
  })

  it('rejeita 422 com setor inválido', async () => {
    const { service } = build()
    await expect(
      service.criar({
        usuarioId: 'u-x',
        nome: 'X',
        email: 'x@hr-core.local',
        setor: 'T',
        criadoPor: 'admin',
        ip: null,
        userAgent: null,
      }),
    ).rejects.toBeInstanceOf(SetorInvalidoError)
  })
})

describe('AvaliadorService.desativar', () => {
  it('marca como inativo e publica evento', async () => {
    const { service, events } = build()
    const criado = await service.criar({
      usuarioId: 'u-2',
      nome: 'X',
      email: 'x@hr-core.local',
      setor: 'Tecnologia',
      criadoPor: 'admin-1',
      ip: null,
      userAgent: null,
    })

    const resultado = await service.desativar({
      id: criado.id,
      desativadoPor: 'admin-1',
      ip: null,
      userAgent: null,
    })

    expect(resultado.ativo).toBe(false)
    expect(events.events.some((e) => e.eventType === 'AvaliadorDesativado')).toBe(true)
  })

  it('404 se id inexistente', async () => {
    const { service } = build()
    await expect(
      service.desativar({
        id: '6a000000000000000000000a',
        desativadoPor: 'admin',
        ip: null,
        userAgent: null,
      }),
    ).rejects.toBeInstanceOf(AvaliadorNaoEncontradoError)
  })
})

describe('AvaliadorService.listar', () => {
  it('filtra por setor + ativo', async () => {
    const { service } = build()
    await service.criar({
      usuarioId: 'u-tec',
      nome: 'A',
      email: 'a@x.local',
      setor: 'Tecnologia',
      criadoPor: 'admin',
      ip: null,
      userAgent: null,
    })
    await service.criar({
      usuarioId: 'u-fin',
      nome: 'B',
      email: 'b@x.local',
      setor: 'Financeiro',
      criadoPor: 'admin',
      ip: null,
      userAgent: null,
    })

    const tec = await service.listar({ setor: 'Tecnologia' })
    expect(tec).toHaveLength(1)
    expect(tec[0]?.setor).toBe('Tecnologia')
  })
})
