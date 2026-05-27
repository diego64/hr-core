import type { FastifyBaseLogger } from 'fastify'
import type { Db } from 'mongodb'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { PeriodoGozoService } from '../modules/services/periodo-gozo.service.js'
import { rodarIniciarGozos } from './iniciar-gozos.job.js'

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
})

describe('rodarIniciarGozos', () => {
  it('retorna null quando lock está em uso', async () => {
    vi.mocked(acquireJobLock).mockResolvedValueOnce(null)
    const iniciarGozosDoDia = vi.fn()
    const gozoService = { iniciarGozosDoDia } as unknown as PeriodoGozoService

    const result = await rodarIniciarGozos({
      db: fakeDb,
      gozoService,
      log: fakeLog,
    })

    expect(result).toBeNull()
    expect(iniciarGozosDoDia).not.toHaveBeenCalled()
  })

  it('delega para gozoService.iniciarGozosDoDia e retorna a contagem', async () => {
    const release = vi.fn().mockResolvedValue(undefined)
    vi.mocked(acquireJobLock).mockResolvedValueOnce({ release })
    const iniciarGozosDoDia = vi.fn().mockResolvedValue(3)
    const gozoService = { iniciarGozosDoDia } as unknown as PeriodoGozoService
    const hoje = new Date('2026-07-10T00:00:00Z')

    const result = await rodarIniciarGozos({ db: fakeDb, gozoService, log: fakeLog }, hoje)

    expect(result).toBe(3)
    expect(iniciarGozosDoDia).toHaveBeenCalledWith(hoje)
    expect(release).toHaveBeenCalledTimes(1)
  })

  it('libera lock mesmo quando o service lança', async () => {
    const release = vi.fn().mockResolvedValue(undefined)
    vi.mocked(acquireJobLock).mockResolvedValueOnce({ release })
    const gozoService = {
      iniciarGozosDoDia: vi.fn().mockRejectedValue(new Error('boom')),
    } as unknown as PeriodoGozoService

    await expect(rodarIniciarGozos({ db: fakeDb, gozoService, log: fakeLog })).rejects.toThrow(
      'boom',
    )
    expect(release).toHaveBeenCalledTimes(1)
  })
})
