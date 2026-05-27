import type { FastifyBaseLogger } from 'fastify'
import type { Db } from 'mongodb'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { FakePeriodoAquisitivoRepository } from '../../test/fakes.js'
import { makePeriodoAquisitivo } from '../../test/factories.js'
import { InMemoryEventPublisher } from '../../test/in-memory-event-publisher.js'
import type { PeriodoAquisitivoRepository } from '../modules/repositories/periodo-aquisitivo.repository.js'
import { rodarVerificarVencimentos } from './verificar-vencimentos.job.js'

// Lock cooperativo depende de Mongo — mockamos para retornar lock fake/null
// e isolarmos o teste do banco.
vi.mock('./lock.js', () => ({
  acquireJobLock: vi.fn(),
}))
import { acquireJobLock } from './lock.js'

const fakeLog = {
  info: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  debug: vi.fn(),
  trace: vi.fn(),
  fatal: vi.fn(),
} as unknown as FastifyBaseLogger

const fakeDb = {} as Db

beforeEach(() => {
  vi.mocked(acquireJobLock).mockReset()
  vi.mocked(acquireJobLock).mockResolvedValue({ release: vi.fn().mockResolvedValue(undefined) })
})

describe('rodarVerificarVencimentos', () => {
  it('retorna null e não toca em nada quando o lock já está detido', async () => {
    vi.mocked(acquireJobLock).mockResolvedValueOnce(null)
    const aquisitivoRepo = new FakePeriodoAquisitivoRepository()
    const events = new InMemoryEventPublisher()

    const result = await rodarVerificarVencimentos({
      db: fakeDb,
      aquisitivoRepo: aquisitivoRepo as unknown as PeriodoAquisitivoRepository,
      events,
      log: fakeLog,
    })

    expect(result).toBeNull()
    expect(events.events).toHaveLength(0)
  })

  it('promove EM_CURSO→DISPONIVEL e marca VENCIDO + publica PeriodoVencido', async () => {
    const aquisitivoRepo = new FakePeriodoAquisitivoRepository()
    const events = new InMemoryEventPublisher()
    const hoje = new Date('2026-06-15T00:00:00Z')

    const aPromover = makePeriodoAquisitivo({
      status: 'EM_CURSO',
      dataInicio: new Date('2025-05-01T00:00:00Z'),
      dataFim: new Date('2026-04-30T23:59:59Z'),
      dataLimiteGozo: new Date('2027-04-30T23:59:59Z'),
    })
    const aVencer = makePeriodoAquisitivo({
      funcionarioId: 'outro-func',
      status: 'DISPONIVEL',
      dataInicio: new Date('2023-01-01T00:00:00Z'),
      dataFim: new Date('2023-12-31T23:59:59Z'),
      dataLimiteGozo: new Date('2024-12-31T23:59:59Z'),
    })
    aquisitivoRepo.insertSeed(aPromover)
    aquisitivoRepo.insertSeed(aVencer)

    const result = await rodarVerificarVencimentos(
      {
        db: fakeDb,
        aquisitivoRepo: aquisitivoRepo as unknown as PeriodoAquisitivoRepository,
        events,
        log: fakeLog,
      },
      hoje,
    )

    expect(result).toMatchObject({
      promovidosParaDisponivel: 1,
      vencidos: 1,
    })
    expect(aquisitivoRepo.docs.get(aPromover._id.toHexString())?.status).toBe('DISPONIVEL')
    expect(aquisitivoRepo.docs.get(aVencer._id.toHexString())?.status).toBe('VENCIDO')
    const vencidos = events.byType('PeriodoVencido')
    expect(vencidos).toHaveLength(1)
    expect(vencidos[0]!.aggregateId).toBe('outro-func')
  })

  it('publica PeriodoVencendo para aquisitivo expirando em ~30 dias', async () => {
    const aquisitivoRepo = new FakePeriodoAquisitivoRepository()
    const events = new InMemoryEventPublisher()
    const hoje = new Date('2026-06-15T00:00:00Z')
    const dataLimite = new Date('2026-07-15T00:00:00Z') // ~30 dias depois

    aquisitivoRepo.insertSeed(
      makePeriodoAquisitivo({
        status: 'DISPONIVEL',
        dataLimiteGozo: dataLimite,
        saldoDias: 15,
      }),
    )

    const result = await rodarVerificarVencimentos(
      {
        db: fakeDb,
        aquisitivoRepo: aquisitivoRepo as unknown as PeriodoAquisitivoRepository,
        events,
        log: fakeLog,
      },
      hoje,
    )

    expect(result?.notificadosVencendo).toBe(1)
    expect(events.byType('PeriodoVencendo')).toHaveLength(1)
    expect(events.byType('PeriodoVencendo')[0]!.payload).toMatchObject({
      saldoDias: 15,
      diasParaVencer: 30,
    })
  })

  it('libera o lock mesmo se algo falhar', async () => {
    const release = vi.fn().mockResolvedValue(undefined)
    vi.mocked(acquireJobLock).mockResolvedValueOnce({ release })
    const aquisitivoRepo = new FakePeriodoAquisitivoRepository()
    // Sabota listarVencidos pra arremessar — força fluxo de erro/finally.
    aquisitivoRepo.listarVencidos = vi.fn().mockRejectedValueOnce(new Error('boom'))
    const events = new InMemoryEventPublisher()

    await expect(
      rodarVerificarVencimentos({
        db: fakeDb,
        aquisitivoRepo: aquisitivoRepo as unknown as PeriodoAquisitivoRepository,
        events,
        log: fakeLog,
      }),
    ).rejects.toThrow('boom')

    expect(release).toHaveBeenCalledTimes(1)
  })
})
