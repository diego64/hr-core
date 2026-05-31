/**
 * Extensão da suite de FolhaService cobrindo branches de erro raras que
 * o folha.service.test.ts (happy path + erros básicos) não exercita:
 *
 *   - FECHADA → FolhaImutavelError em CADA método (lançar/remover/processar/
 *     aprovar/rejeitar/pagar/fechar)
 *   - Status não compatível com a operação em vários métodos
 *   - lancarVerba: valor negativo + tipo DESCONTO + referência null vs absent
 *   - Race detection: spy no repo forçando modifiedCount=0 →
 *     FolhaStatusInvalidoError em cada transição
 */
import { describe, expect, it, beforeEach, vi } from 'vitest'

import {
  FakeAuditoriaRepository,
  FakeContadorRepository,
  FakeFolhaRepository,
  FakeFuncionarioCacheRepository,
} from '../../../test/fakes.js'
import { makeFolha, makeFuncionarioCache } from '../../../test/factories.js'
import { InMemoryEventPublisher } from '../../../test/in-memory-event-publisher.js'
import {
  FolhaImutavelError,
  FolhaStatusInvalidoError,
  JustificativaRejeicaoObrigatoriaError,
  VerbaInvalidaError,
} from '../domain/errors/domain-error.js'
import type { AuditoriaRepository } from '../repositories/auditoria.repository.js'
import type { ContadorRepository } from '../repositories/contador.repository.js'
import type { FolhaRepository } from '../repositories/folha.repository.js'
import type { FuncionarioCacheRepository } from '../repositories/funcionario-cache.repository.js'
import { AuditoriaService } from './auditoria.service.js'
import { FolhaService } from './folha.service.js'

interface Harness {
  service: FolhaService
  folhaRepo: FakeFolhaRepository
  funcionarioRepo: FakeFuncionarioCacheRepository
  contadorRepo: FakeContadorRepository
  audRepo: FakeAuditoriaRepository
  events: InMemoryEventPublisher
}

function buildHarness(): Harness {
  const folhaRepo = new FakeFolhaRepository()
  const funcionarioRepo = new FakeFuncionarioCacheRepository()
  const contadorRepo = new FakeContadorRepository()
  const audRepo = new FakeAuditoriaRepository()
  const events = new InMemoryEventPublisher()
  const auditoria = new AuditoriaService(audRepo as unknown as AuditoriaRepository)
  const service = new FolhaService(
    folhaRepo as unknown as FolhaRepository,
    funcionarioRepo as unknown as FuncionarioCacheRepository,
    contadorRepo as unknown as ContadorRepository,
    auditoria,
    events,
  )
  return { service, folhaRepo, funcionarioRepo, contadorRepo, audRepo, events }
}

describe('FolhaService — branches de erro raras', () => {
  let h: Harness

  beforeEach(() => {
    h = buildHarness()
    h.funcionarioRepo.insert(makeFuncionarioCache())
  })

  // FolhaImutavelError em todas as operações depois de FECHADA
  describe('FECHADA → FolhaImutavelError em cada método', () => {
    it.each([
      [
        'lancarVerba',
        (svc: FolhaService, folhaId: string) =>
          svc.lancarVerba({ folhaId, codigo: '002', valor: 100, usuarioId: 'u' }),
      ],
      [
        'removerVerba',
        (svc: FolhaService, folhaId: string) =>
          svc.removerVerba({ folhaId, codigoVerba: '002', usuarioId: 'u' }),
      ],
      [
        'processar',
        (svc: FolhaService, folhaId: string) => svc.processar({ folhaId, usuarioId: 'u' }),
      ],
      ['aprovar', (svc: FolhaService, folhaId: string) => svc.aprovar({ folhaId, usuarioId: 'u' })],
      [
        'rejeitar',
        (svc: FolhaService, folhaId: string) =>
          svc.rejeitar({ folhaId, usuarioId: 'u', justificativa: 'algum motivo' }),
      ],
      [
        'confirmarPagamento',
        (svc: FolhaService, folhaId: string) => svc.confirmarPagamento({ folhaId, usuarioId: 'u' }),
      ],
      ['fechar', (svc: FolhaService, folhaId: string) => svc.fechar({ folhaId, usuarioId: 'u' })],
    ])('%s em folha FECHADA → FolhaImutavelError', async (_, op) => {
      const fechada = makeFolha({ status: 'FECHADA' })
      h.folhaRepo.insert(fechada)
      await expect(op(h.service, fechada._id.toHexString())).rejects.toThrow(FolhaImutavelError)
    })
  })

  // Status inválido (não-FECHADA) em cada método
  describe('Status incompatível → FolhaStatusInvalidoError', () => {
    it('removerVerba em folha PROCESSADA → invalido', async () => {
      const folha = makeFolha({ status: 'PROCESSADA' })
      h.folhaRepo.insert(folha)
      await expect(
        h.service.removerVerba({
          folhaId: folha._id.toHexString(),
          codigoVerba: '002',
          usuarioId: 'u',
        }),
      ).rejects.toThrow(FolhaStatusInvalidoError)
    })

    it('processar em folha APROVADA → invalido (apenas ABERTA ou PROCESSADA permitidos)', async () => {
      const folha = makeFolha({ status: 'APROVADA' })
      h.folhaRepo.insert(folha)
      await expect(
        h.service.processar({ folhaId: folha._id.toHexString(), usuarioId: 'u' }),
      ).rejects.toThrow(FolhaStatusInvalidoError)
    })

    it('rejeitar em folha ABERTA → invalido (precisa PROCESSADA)', async () => {
      const folha = makeFolha({ status: 'ABERTA' })
      h.folhaRepo.insert(folha)
      await expect(
        h.service.rejeitar({
          folhaId: folha._id.toHexString(),
          usuarioId: 'u',
          justificativa: 'algum motivo válido',
        }),
      ).rejects.toThrow(FolhaStatusInvalidoError)
    })

    it('fechar em folha APROVADA → invalido (precisa PAGA)', async () => {
      const folha = makeFolha({ status: 'APROVADA' })
      h.folhaRepo.insert(folha)
      await expect(
        h.service.fechar({ folhaId: folha._id.toHexString(), usuarioId: 'u' }),
      ).rejects.toThrow(FolhaStatusInvalidoError)
    })
  })

  // lancarVerba: branches específicas
  describe('lancarVerba edges', () => {
    it('valor negativo → VerbaInvalidaError', async () => {
      const aberta = await h.service.abrir({
        codigoFun: 'FUN12345678900',
        tipo: 'MENSAL',
        competencia: '2026-05',
        abertaPor: 'coord-1',
      })

      await expect(
        h.service.lancarVerba({
          folhaId: aberta.id,
          codigo: '002',
          valor: -1,
          usuarioId: 'coord-1',
        }),
      ).rejects.toThrow(VerbaInvalidaError)
    })

    it('verba do tipo DESCONTO (103 vale transporte) é lançada como desconto', async () => {
      const aberta = await h.service.abrir({
        codigoFun: 'FUN12345678900',
        tipo: 'MENSAL',
        competencia: '2026-05',
        abertaPor: 'coord-1',
      })
      const r = await h.service.lancarVerba({
        folhaId: aberta.id,
        codigo: '103',
        valor: 300,
        descricao: 'Vale transporte',
        usuarioId: 'coord-1',
      })

      expect(r.descontos.find((d) => d.codigo === '103')?.valor).toBe(300)
      expect(r.proventos.find((p) => p.codigo === '103')).toBeUndefined()
    })

    it('lançar verba com referencia=undefined NÃO seta o campo referencia', async () => {
      const aberta = await h.service.abrir({
        codigoFun: 'FUN12345678900',
        tipo: 'MENSAL',
        competencia: '2026-05',
        abertaPor: 'coord-1',
      })
      const r = await h.service.lancarVerba({
        folhaId: aberta.id,
        codigo: '002',
        valor: 100,
        usuarioId: 'coord-1',
      })
      const item = r.proventos.find((p) => p.codigo === '002')!
      // PublicItemFolha normaliza referencia ausente para null
      expect(item.referencia).toBeNull()
    })
  })

  // Race detection — spy no fake forçando false
  describe('Race detection (modifiedCount = 0)', () => {
    it('lancarVerba: setProventosDescontos retorna false → FolhaStatusInvalidoError', async () => {
      const aberta = await h.service.abrir({
        codigoFun: 'FUN12345678900',
        tipo: 'MENSAL',
        competencia: '2026-05',
        abertaPor: 'coord-1',
      })

      const spy = vi.spyOn(h.folhaRepo, 'setProventosDescontos').mockResolvedValueOnce(false)
      await expect(
        h.service.lancarVerba({
          folhaId: aberta.id,
          codigo: '002',
          valor: 100,
          usuarioId: 'coord-1',
        }),
      ).rejects.toThrow(FolhaStatusInvalidoError)
      spy.mockRestore()
    })

    it('processar: repo.processar retorna false → FolhaStatusInvalidoError', async () => {
      const folha = makeFolha({ status: 'ABERTA' })
      h.folhaRepo.insert(folha)
      const spy = vi.spyOn(h.folhaRepo, 'processar').mockResolvedValueOnce(false)
      await expect(
        h.service.processar({ folhaId: folha._id.toHexString(), usuarioId: 'u' }),
      ).rejects.toThrow(FolhaStatusInvalidoError)
      spy.mockRestore()
    })

    it('aprovar: repo.aprovar retorna false → FolhaStatusInvalidoError', async () => {
      const folha = makeFolha({ status: 'PROCESSADA' })
      h.folhaRepo.insert(folha)
      const spy = vi.spyOn(h.folhaRepo, 'aprovar').mockResolvedValueOnce(false)
      await expect(
        h.service.aprovar({ folhaId: folha._id.toHexString(), usuarioId: 'u' }),
      ).rejects.toThrow(FolhaStatusInvalidoError)
      spy.mockRestore()
    })

    it('rejeitar: repo.rejeitar retorna false → FolhaStatusInvalidoError', async () => {
      const folha = makeFolha({ status: 'PROCESSADA' })
      h.folhaRepo.insert(folha)
      const spy = vi.spyOn(h.folhaRepo, 'rejeitar').mockResolvedValueOnce(false)
      await expect(
        h.service.rejeitar({
          folhaId: folha._id.toHexString(),
          usuarioId: 'u',
          justificativa: 'motivo válido',
        }),
      ).rejects.toThrow(FolhaStatusInvalidoError)
      spy.mockRestore()
    })

    it('confirmarPagamento: repo.confirmarPagamento retorna false → FolhaStatusInvalidoError', async () => {
      const folha = makeFolha({ status: 'APROVADA' })
      h.folhaRepo.insert(folha)
      const spy = vi.spyOn(h.folhaRepo, 'confirmarPagamento').mockResolvedValueOnce(false)
      await expect(
        h.service.confirmarPagamento({ folhaId: folha._id.toHexString(), usuarioId: 'u' }),
      ).rejects.toThrow(FolhaStatusInvalidoError)
      spy.mockRestore()
    })

    it('fechar: repo.fechar retorna false → FolhaStatusInvalidoError', async () => {
      const folha = makeFolha({ status: 'PAGA' })
      h.folhaRepo.insert(folha)
      const spy = vi.spyOn(h.folhaRepo, 'fechar').mockResolvedValueOnce(false)
      await expect(
        h.service.fechar({ folhaId: folha._id.toHexString(), usuarioId: 'u' }),
      ).rejects.toThrow(FolhaStatusInvalidoError)
      spy.mockRestore()
    })

    it('removerVerba: setProventosDescontos retorna false → FolhaStatusInvalidoError', async () => {
      const folha = makeFolha({
        status: 'ABERTA',
        proventos: [{ codigo: '002', descricao: 'HE', tipo: 'PROVENTO', valor: 100 }],
      })
      h.folhaRepo.insert(folha)
      const spy = vi.spyOn(h.folhaRepo, 'setProventosDescontos').mockResolvedValueOnce(false)
      await expect(
        h.service.removerVerba({
          folhaId: folha._id.toHexString(),
          codigoVerba: '002',
          usuarioId: 'u',
        }),
      ).rejects.toThrow(FolhaStatusInvalidoError)
      spy.mockRestore()
    })
  })

  // rejeitar: justificativa apenas com whitespace
  it('rejeitar: justificativa só com espaços → JustificativaRejeicaoObrigatoriaError', async () => {
    const folha = makeFolha({ status: 'PROCESSADA' })
    h.folhaRepo.insert(folha)
    await expect(
      h.service.rejeitar({
        folhaId: folha._id.toHexString(),
        usuarioId: 'u',
        justificativa: '   ',
      }),
    ).rejects.toThrow(JustificativaRejeicaoObrigatoriaError)
  })
})
