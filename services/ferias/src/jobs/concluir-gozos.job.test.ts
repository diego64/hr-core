import type { FastifyBaseLogger } from 'fastify'
import type { Db } from 'mongodb'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { PeriodoGozoService } from '../modules/services/periodo-gozo.service.js'
import { rodarConcluirGozos } from './concluir-gozos.job.js'

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

describe('rodarConcluirGozos', () => {
  it('retorna null quando lock está em uso', async () => {
    vi.mocked(acquireJobLock).mockResolvedValueOnce(null)
    const concluirGozosDoDia = vi.fn()
    const gozoService = { concluirGozosDoDia } as unknown as PeriodoGozoService

    const result = await rodarConcluirGozos({
      db: fakeDb,
      gozoService,
      log: fakeLog,
    })

    expect(result).toBeNull()
    expect(concluirGozosDoDia).not.toHaveBeenCalled()
  })

  it('delega para gozoService.concluirGozosDoDia e retorna a contagem', async () => {
    const release = vi.fn().mockResolvedValue(undefined)
    vi.mocked(acquireJobLock).mockResolvedValueOnce({ release })
    const concluirGozosDoDia = vi.fn().mockResolvedValue(2)
    const gozoService = { concluirGozosDoDia } as unknown as PeriodoGozoService
    const hoje = new Date('2026-07-20T00:00:00Z')

    const result = await rodarConcluirGozos({ db: fakeDb, gozoService, log: fakeLog }, hoje)

    expect(result).toBe(2)
    expect(concluirGozosDoDia).toHaveBeenCalledWith(hoje)
    expect(release).toHaveBeenCalledTimes(1)
  })

  it('libera lock mesmo quando o service lança', async () => {
    const release = vi.fn().mockResolvedValue(undefined)
    vi.mocked(acquireJobLock).mockResolvedValueOnce({ release })
    const gozoService = {
      concluirGozosDoDia: vi.fn().mockRejectedValue(new Error('boom')),
    } as unknown as PeriodoGozoService

    await expect(rodarConcluirGozos({ db: fakeDb, gozoService, log: fakeLog })).rejects.toThrow(
      'boom',
    )
    expect(release).toHaveBeenCalledTimes(1)
  })
})
