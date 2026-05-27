import { describe, expect, it } from 'vitest'

import { FakePeriodoAquisitivoRepository } from '../../../test/fakes.js'
import { InMemoryEventPublisher } from '../../../test/in-memory-event-publisher.js'
import { FUNCIONARIO_ID_DEFAULT, makePeriodoAquisitivo } from '../../../test/factories.js'
import { CpfInvalidoError } from '../domain/value-objects/cpf.js'
import { PeriodoAquisitivoNaoEncontradoError } from '../domain/errors/domain-error.js'
import type { PeriodoAquisitivoRepository } from '../repositories/periodo-aquisitivo.repository.js'
import { PeriodoAquisitivoService } from './periodo-aquisitivo.service.js'

const CPF_VALIDO = '52998224725'

function buildService(): {
  service: PeriodoAquisitivoService
  repo: FakePeriodoAquisitivoRepository
  events: InMemoryEventPublisher
} {
  const repo = new FakePeriodoAquisitivoRepository()
  const events = new InMemoryEventPublisher()
  const service = new PeriodoAquisitivoService(
    repo as unknown as PeriodoAquisitivoRepository,
    events,
  )
  return { service, repo, events }
}

describe('PeriodoAquisitivoService', () => {
  describe('iniciar', () => {
    it('cria período aquisitivo, deriva codigoFun do CPF e publica NovoPeriodoAquisitivo', async () => {
      const { service, repo, events } = buildService()
      const dataInicio = new Date('2026-01-15T00:00:00Z')

      const result = await service.iniciar({
        funcionarioId: FUNCIONARIO_ID_DEFAULT,
        cpf: '529.982.247-25',
        dataInicio,
      })

      expect(result.codigoFun).toBe(`FUN${CPF_VALIDO}`)
      expect(result.funcionarioId).toBe(FUNCIONARIO_ID_DEFAULT)
      expect(result.dataInicio).toBe(dataInicio.toISOString())
      expect(result.status).toBe('EM_CURSO')

      expect(repo.docs.size).toBe(1)
      const novos = events.byType('NovoPeriodoAquisitivo')
      expect(novos).toHaveLength(1)
      expect(novos[0]!.aggregateId).toBe(FUNCIONARIO_ID_DEFAULT)
      expect(novos[0]!.payload.codigoFun).toBe(`FUN${CPF_VALIDO}`)
      expect(novos[0]!.source).toBe('ms-ferias')
    })

    it('rejeita CPF inválido com CpfInvalidoError', async () => {
      const { service, events } = buildService()
      await expect(
        service.iniciar({
          funcionarioId: FUNCIONARIO_ID_DEFAULT,
          cpf: '111.111.111-11',
          dataInicio: new Date('2026-01-15T00:00:00Z'),
        }),
      ).rejects.toBeInstanceOf(CpfInvalidoError)
      expect(events.events).toHaveLength(0)
    })
  })

  describe('buscarVigente', () => {
    it('retorna o vigente quando existe DISPONIVEL', async () => {
      const { service, repo } = buildService()
      const seed = makePeriodoAquisitivo({ status: 'DISPONIVEL' })
      repo.insertSeed(seed)

      const result = await service.buscarVigente(FUNCIONARIO_ID_DEFAULT)
      expect(result.id).toBe(seed._id.toHexString())
      expect(result.status).toBe('DISPONIVEL')
    })

    it('ignora aquisitivos VENCIDO ou ENCERRADO', async () => {
      const { service, repo } = buildService()
      repo.insertSeed(makePeriodoAquisitivo({ status: 'VENCIDO' }))
      repo.insertSeed(makePeriodoAquisitivo({ status: 'ENCERRADO' }))

      await expect(service.buscarVigente(FUNCIONARIO_ID_DEFAULT)).rejects.toBeInstanceOf(
        PeriodoAquisitivoNaoEncontradoError,
      )
    })

    it('lança PeriodoAquisitivoNaoEncontradoError quando não há vigente', async () => {
      const { service } = buildService()
      await expect(service.buscarVigente('outro-func')).rejects.toBeInstanceOf(
        PeriodoAquisitivoNaoEncontradoError,
      )
    })
  })

  describe('listarHistorico', () => {
    it('ordena do mais recente para o mais antigo', async () => {
      const { service, repo } = buildService()
      const antigo = makePeriodoAquisitivo({
        dataInicio: new Date('2023-01-01T00:00:00Z'),
        status: 'ENCERRADO',
      })
      const novo = makePeriodoAquisitivo({
        dataInicio: new Date('2025-01-01T00:00:00Z'),
        status: 'DISPONIVEL',
      })
      repo.insertSeed(antigo)
      repo.insertSeed(novo)

      const result = await service.listarHistorico(FUNCIONARIO_ID_DEFAULT)
      expect(result.map((r) => r.id)).toEqual([novo._id.toHexString(), antigo._id.toHexString()])
    })

    it('retorna array vazio quando funcionário não tem período', async () => {
      const { service } = buildService()
      const result = await service.listarHistorico('nao-existe')
      expect(result).toEqual([])
    })
  })

  describe('carregarVigenteRaw', () => {
    it('retorna a entidade crua (com ObjectId) para uso interno', async () => {
      const { service, repo } = buildService()
      const seed = makePeriodoAquisitivo({ status: 'EM_GOZO' })
      repo.insertSeed(seed)

      const result = await service.carregarVigenteRaw(FUNCIONARIO_ID_DEFAULT)
      expect(result._id.toHexString()).toBe(seed._id.toHexString())
    })

    it('lança quando não há vigente', async () => {
      const { service } = buildService()
      await expect(service.carregarVigenteRaw('nao-existe')).rejects.toBeInstanceOf(
        PeriodoAquisitivoNaoEncontradoError,
      )
    })
  })
})
