import { describe, expect, it } from 'vitest'

import {
  FakeAuditoriaRepository,
  FakePeriodoAquisitivoRepository,
  FakePeriodoGozoRepository,
} from '../../../test/fakes.js'
import { InMemoryEventPublisher } from '../../../test/in-memory-event-publisher.js'
import {
  FUNCIONARIO_ID_DEFAULT,
  makePeriodoAquisitivo,
  makePeriodoGozo,
} from '../../../test/factories.js'
import { PeriodoGozoNaoEncontradoError } from '../domain/errors/domain-error.js'
import type { AuditoriaRepository } from '../repositories/auditoria.repository.js'
import type { PeriodoAquisitivoRepository } from '../repositories/periodo-aquisitivo.repository.js'
import type { PeriodoGozoRepository } from '../repositories/periodo-gozo.repository.js'
import { AuditoriaService } from './auditoria.service.js'
import { PeriodoGozoService } from './periodo-gozo.service.js'

function buildService(): {
  service: PeriodoGozoService
  gozoRepo: FakePeriodoGozoRepository
  aquisitivoRepo: FakePeriodoAquisitivoRepository
  audRepo: FakeAuditoriaRepository
  events: InMemoryEventPublisher
} {
  const gozoRepo = new FakePeriodoGozoRepository()
  const aquisitivoRepo = new FakePeriodoAquisitivoRepository()
  const audRepo = new FakeAuditoriaRepository()
  const events = new InMemoryEventPublisher()
  const auditoria = new AuditoriaService(audRepo as unknown as AuditoriaRepository)
  const service = new PeriodoGozoService(
    gozoRepo as unknown as PeriodoGozoRepository,
    aquisitivoRepo as unknown as PeriodoAquisitivoRepository,
    auditoria,
    events,
  )
  return { service, gozoRepo, aquisitivoRepo, audRepo, events }
}

describe('PeriodoGozoService', () => {
  describe('buscarPorId / listarPorFuncionario', () => {
    it('busca por id retorna entidade pública', async () => {
      const { service, gozoRepo } = buildService()
      const seed = makePeriodoGozo({ status: 'AGENDADO' })
      gozoRepo.insertSeed(seed)
      const result = await service.buscarPorId(seed._id.toHexString())
      expect(result.id).toBe(seed._id.toHexString())
      expect(result.status).toBe('AGENDADO')
    })

    it('lança PeriodoGozoNaoEncontradoError quando id não existe', async () => {
      const { service } = buildService()
      await expect(service.buscarPorId('507f1f77bcf86cd799439011')).rejects.toBeInstanceOf(
        PeriodoGozoNaoEncontradoError,
      )
    })

    it('lista por funcionário do mais recente pro mais antigo', async () => {
      const { service, gozoRepo } = buildService()
      gozoRepo.insertSeed(makePeriodoGozo({ dataInicio: new Date('2024-03-01T00:00:00Z') }))
      gozoRepo.insertSeed(makePeriodoGozo({ dataInicio: new Date('2025-03-01T00:00:00Z') }))
      const lista = await service.listarPorFuncionario(FUNCIONARIO_ID_DEFAULT)
      expect(lista.map((g) => g.dataInicio)).toEqual([
        new Date('2025-03-01T00:00:00Z').toISOString(),
        new Date('2024-03-01T00:00:00Z').toISOString(),
      ])
    })
  })

  describe('iniciarGozosDoDia', () => {
    it('promove AGENDADO → EM_GOZO para gozos com dataInicio <= hoje', async () => {
      const { service, gozoRepo, audRepo, events } = buildService()
      const hoje = new Date('2026-07-05T10:00:00Z')
      const elegivel = makePeriodoGozo({
        dataInicio: new Date('2026-07-01T00:00:00Z'),
        dataFim: new Date('2026-07-14T23:59:59Z'),
        status: 'AGENDADO',
      })
      const futuro = makePeriodoGozo({
        dataInicio: new Date('2026-08-01T00:00:00Z'),
        dataFim: new Date('2026-08-14T23:59:59Z'),
        status: 'AGENDADO',
      })
      gozoRepo.insertSeed(elegivel)
      gozoRepo.insertSeed(futuro)

      const total = await service.iniciarGozosDoDia(hoje)

      expect(total).toBe(1)
      expect(gozoRepo.docs.get(elegivel._id.toHexString())?.status).toBe('EM_GOZO')
      expect(gozoRepo.docs.get(futuro._id.toHexString())?.status).toBe('AGENDADO')
      expect(events.byType('GozoIniciado')).toHaveLength(1)
      expect(audRepo.docs).toHaveLength(1)
      expect(audRepo.docs[0]!.acao).toBe('GOZO_INICIADO')
    })

    it('idempotente — não re-publica evento se status já EM_GOZO', async () => {
      const { service, gozoRepo, events } = buildService()
      // status EM_GOZO já — listarParaIniciar retorna [] (filtra AGENDADO)
      gozoRepo.insertSeed(
        makePeriodoGozo({
          dataInicio: new Date('2026-07-01T00:00:00Z'),
          status: 'EM_GOZO',
        }),
      )
      const total = await service.iniciarGozosDoDia(new Date('2026-07-10T00:00:00Z'))
      expect(total).toBe(0)
      expect(events.events).toHaveLength(0)
    })
  })

  describe('concluirGozosDoDia', () => {
    it('conclui gozo encerrando aquisitivo e cria novo período aquisitivo', async () => {
      const { service, gozoRepo, aquisitivoRepo, events } = buildService()
      const aquisitivo = makePeriodoAquisitivo({
        status: 'ENCERRADO',
        diasGozados: 30,
        saldoDias: 0,
      })
      aquisitivoRepo.insertSeed(aquisitivo)
      const gozo = makePeriodoGozo({
        periodoAquisitivoId: aquisitivo._id,
        dataInicio: new Date('2026-07-01T00:00:00Z'),
        dataFim: new Date('2026-07-14T23:59:59Z'),
        status: 'EM_GOZO',
      })
      gozoRepo.insertSeed(gozo)

      const total = await service.concluirGozosDoDia(new Date('2026-07-16T00:00:00Z'))

      expect(total).toBe(1)
      expect(gozoRepo.docs.get(gozo._id.toHexString())?.status).toBe('CONCLUIDO')
      expect(events.byType('GozoConcluido')).toHaveLength(1)
      expect(events.byType('NovoPeriodoAquisitivo')).toHaveLength(1)
      // Novo aquisitivo começa no dia seguinte ao fim do gozo
      const novosAquisitivos = [...aquisitivoRepo.docs.values()].filter(
        (a) => a._id.toHexString() !== aquisitivo._id.toHexString(),
      )
      expect(novosAquisitivos).toHaveLength(1)
      expect(novosAquisitivos[0]!.dataInicio.toISOString()).toBe(
        new Date('2026-07-15T23:59:59Z').toISOString(),
      )
    })

    it('não cria novo aquisitivo se o origem ainda tem saldo', async () => {
      const { service, gozoRepo, aquisitivoRepo, events } = buildService()
      const aquisitivo = makePeriodoAquisitivo({
        status: 'EM_GOZO',
        diasGozados: 10,
        saldoDias: 20,
      })
      aquisitivoRepo.insertSeed(aquisitivo)
      const gozo = makePeriodoGozo({
        periodoAquisitivoId: aquisitivo._id,
        dataInicio: new Date('2026-07-01T00:00:00Z'),
        dataFim: new Date('2026-07-10T23:59:59Z'),
        diasGozo: 10,
        status: 'EM_GOZO',
      })
      gozoRepo.insertSeed(gozo)

      const total = await service.concluirGozosDoDia(new Date('2026-07-12T00:00:00Z'))

      expect(total).toBe(1)
      expect(events.byType('GozoConcluido')).toHaveLength(1)
      expect(events.byType('NovoPeriodoAquisitivo')).toHaveLength(0)
      expect([...aquisitivoRepo.docs.values()]).toHaveLength(1) // só o original
    })

    it('ignora gozos com dataFim ainda no futuro (listarParaConcluir filtra)', async () => {
      const { service, gozoRepo, events } = buildService()
      gozoRepo.insertSeed(
        makePeriodoGozo({
          dataInicio: new Date('2026-07-01T00:00:00Z'),
          dataFim: new Date('2026-07-14T23:59:59Z'),
          status: 'EM_GOZO',
        }),
      )
      const total = await service.concluirGozosDoDia(new Date('2026-07-10T00:00:00Z'))
      expect(total).toBe(0)
      expect(events.events).toHaveLength(0)
    })
  })
})
