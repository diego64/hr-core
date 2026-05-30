import { describe, expect, it, beforeEach } from 'vitest'

import {
  FakeAuditoriaRepository,
  FakeContadorRepository,
  FakeFolhaRepository,
  FakeFuncionarioCacheRepository,
} from '../../../test/fakes.js'
import { makeFuncionarioCache } from '../../../test/factories.js'
import { InMemoryEventPublisher } from '../../../test/in-memory-event-publisher.js'
import {
  FolhaCompetenciaDuplicadaError,
  FolhaImutavelError,
  FolhaNaoEncontradaError,
  FolhaStatusInvalidoError,
  FuncionarioCacheNaoEncontradoError,
  FuncionarioInativoError,
  JustificativaRejeicaoObrigatoriaError,
  SalarioNaoInformadoError,
  VerbaInvalidaError,
  VerbaNaoEncontradaError,
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

describe('FolhaService', () => {
  let h: Harness

  beforeEach(() => {
    h = buildHarness()
    h.funcionarioRepo.insert(makeFuncionarioCache())
  })

  describe('abrir', () => {
    it('cria folha ABERTA, registra auditoria e publica FolhaAberta', async () => {
      const folha = await h.service.abrir({
        codigoFun: 'FUN12345678900',
        tipo: 'MENSAL',
        competencia: '2026-05',
        abertaPor: 'coord-1',
      })

      expect(folha.status).toBe('ABERTA')
      expect(folha.codigo).toMatch(/^FOLHA\d+$/)
      expect(folha.salarioBase).toBe(5_000)
      expect(h.events.byType('FolhaAberta')).toHaveLength(1)
      expect(h.audRepo.registros.some((r) => r.acao === 'FOLHA_ABERTA')).toBe(true)
    })

    it('rejeita funcionário não encontrado no cache', async () => {
      await expect(
        h.service.abrir({
          codigoFun: 'FUN99999999999',
          tipo: 'MENSAL',
          competencia: '2026-05',
          abertaPor: 'coord-1',
        }),
      ).rejects.toThrow(FuncionarioCacheNaoEncontradoError)
    })

    it('rejeita funcionário inativo', async () => {
      h.funcionarioRepo.items.clear()
      h.funcionarioRepo.insert(makeFuncionarioCache({ ativo: false }))

      await expect(
        h.service.abrir({
          codigoFun: 'FUN12345678900',
          tipo: 'MENSAL',
          competencia: '2026-05',
          abertaPor: 'coord-1',
        }),
      ).rejects.toThrow(FuncionarioInativoError)
    })

    it('rejeita funcionário sem salário base', async () => {
      h.funcionarioRepo.items.clear()
      h.funcionarioRepo.insert(makeFuncionarioCache({ salarioBase: 0 }))

      await expect(
        h.service.abrir({
          codigoFun: 'FUN12345678900',
          tipo: 'MENSAL',
          competencia: '2026-05',
          abertaPor: 'coord-1',
        }),
      ).rejects.toThrow(SalarioNaoInformadoError)
    })

    it('rejeita duplicidade (mesmo funcionário/tipo/competência)', async () => {
      await h.service.abrir({
        codigoFun: 'FUN12345678900',
        tipo: 'MENSAL',
        competencia: '2026-05',
        abertaPor: 'coord-1',
      })

      await expect(
        h.service.abrir({
          codigoFun: 'FUN12345678900',
          tipo: 'MENSAL',
          competencia: '2026-05',
          abertaPor: 'coord-1',
        }),
      ).rejects.toThrow(FolhaCompetenciaDuplicadaError)
    })
  })

  describe('lancarVerba', () => {
    it('lança hora extra (provento variável)', async () => {
      const aberta = await h.service.abrir({
        codigoFun: 'FUN12345678900',
        tipo: 'MENSAL',
        competencia: '2026-05',
        abertaPor: 'coord-1',
      })

      const atualizada = await h.service.lancarVerba({
        folhaId: aberta.id,
        codigo: '002',
        valor: 250,
        referencia: '10h',
        usuarioId: 'coord-1',
      })

      expect(atualizada.proventos.find((p) => p.codigo === '002')?.valor).toBe(250)
      expect(atualizada.proventos.find((p) => p.codigo === '002')?.referencia).toBe('10h')
    })

    it('atualiza valor quando lançada novamente a mesma verba', async () => {
      const aberta = await h.service.abrir({
        codigoFun: 'FUN12345678900',
        tipo: 'MENSAL',
        competencia: '2026-05',
        abertaPor: 'coord-1',
      })

      await h.service.lancarVerba({
        folhaId: aberta.id,
        codigo: '002',
        valor: 100,
        usuarioId: 'coord-1',
      })
      const segundoLancamento = await h.service.lancarVerba({
        folhaId: aberta.id,
        codigo: '002',
        valor: 250,
        usuarioId: 'coord-1',
      })

      expect(segundoLancamento.proventos.filter((p) => p.codigo === '002')).toHaveLength(1)
      expect(segundoLancamento.proventos.find((p) => p.codigo === '002')?.valor).toBe(250)
    })

    it('rejeita verba automática (101 INSS)', async () => {
      const aberta = await h.service.abrir({
        codigoFun: 'FUN12345678900',
        tipo: 'MENSAL',
        competencia: '2026-05',
        abertaPor: 'coord-1',
      })

      await expect(
        h.service.lancarVerba({
          folhaId: aberta.id,
          codigo: '101',
          valor: 100,
          usuarioId: 'coord-1',
        }),
      ).rejects.toThrow(VerbaInvalidaError)
    })

    it('rejeita verba desconhecida', async () => {
      const aberta = await h.service.abrir({
        codigoFun: 'FUN12345678900',
        tipo: 'MENSAL',
        competencia: '2026-05',
        abertaPor: 'coord-1',
      })

      await expect(
        h.service.lancarVerba({
          folhaId: aberta.id,
          codigo: '999',
          valor: 100,
          usuarioId: 'coord-1',
        }),
      ).rejects.toThrow(VerbaInvalidaError)
    })

    it('rejeita lançamento em folha não ABERTA', async () => {
      const aberta = await h.service.abrir({
        codigoFun: 'FUN12345678900',
        tipo: 'MENSAL',
        competencia: '2026-05',
        abertaPor: 'coord-1',
      })
      await h.service.processar({ folhaId: aberta.id, usuarioId: 'coord-1' })

      await expect(
        h.service.lancarVerba({
          folhaId: aberta.id,
          codigo: '002',
          valor: 100,
          usuarioId: 'coord-1',
        }),
      ).rejects.toThrow(FolhaStatusInvalidoError)
    })
  })

  describe('removerVerba', () => {
    it('remove verba lançada', async () => {
      const aberta = await h.service.abrir({
        codigoFun: 'FUN12345678900',
        tipo: 'MENSAL',
        competencia: '2026-05',
        abertaPor: 'coord-1',
      })
      await h.service.lancarVerba({
        folhaId: aberta.id,
        codigo: '002',
        valor: 100,
        usuarioId: 'coord-1',
      })

      const semVerba = await h.service.removerVerba({
        folhaId: aberta.id,
        codigoVerba: '002',
        usuarioId: 'coord-1',
      })

      expect(semVerba.proventos.find((p) => p.codigo === '002')).toBeUndefined()
    })

    it('rejeita remoção de verba inexistente', async () => {
      const aberta = await h.service.abrir({
        codigoFun: 'FUN12345678900',
        tipo: 'MENSAL',
        competencia: '2026-05',
        abertaPor: 'coord-1',
      })

      await expect(
        h.service.removerVerba({
          folhaId: aberta.id,
          codigoVerba: '002',
          usuarioId: 'coord-1',
        }),
      ).rejects.toThrow(VerbaNaoEncontradaError)
    })

    it('rejeita remoção de verba automática', async () => {
      const aberta = await h.service.abrir({
        codigoFun: 'FUN12345678900',
        tipo: 'MENSAL',
        competencia: '2026-05',
        abertaPor: 'coord-1',
      })

      await expect(
        h.service.removerVerba({
          folhaId: aberta.id,
          codigoVerba: '001',
          usuarioId: 'coord-1',
        }),
      ).rejects.toThrow(VerbaInvalidaError)
    })
  })

  describe('processar', () => {
    it('calcula INSS, IRRF, FGTS e salário líquido', async () => {
      const aberta = await h.service.abrir({
        codigoFun: 'FUN12345678900',
        tipo: 'MENSAL',
        competencia: '2026-05',
        abertaPor: 'coord-1',
      })

      const processada = await h.service.processar({
        folhaId: aberta.id,
        usuarioId: 'coord-1',
      })

      expect(processada.status).toBe('PROCESSADA')
      expect(processada.descontoINSS).toBeCloseTo(518.82, 2)
      expect(processada.descontoIRRF).toBeCloseTo(345.5, 2)
      expect(processada.fgts).toBe(400) // 8% de 5.000
      expect(processada.processadaPor).toBe('coord-1')
      expect(h.events.byType('FolhaProcessada')).toHaveLength(1)
    })

    it('permite reprocessar (PROCESSADA → PROCESSADA atualiza)', async () => {
      const aberta = await h.service.abrir({
        codigoFun: 'FUN12345678900',
        tipo: 'MENSAL',
        competencia: '2026-05',
        abertaPor: 'coord-1',
      })
      const primeira = await h.service.processar({
        folhaId: aberta.id,
        usuarioId: 'coord-1',
      })
      const segunda = await h.service.processar({
        folhaId: aberta.id,
        usuarioId: 'coord-2',
      })

      expect(primeira.status).toBe('PROCESSADA')
      expect(segunda.status).toBe('PROCESSADA')
      expect(segunda.processadaPor).toBe('coord-2')
    })
  })

  describe('aprovar/rejeitar', () => {
    it('aprova folha PROCESSADA e publica FolhaAprovada', async () => {
      const aberta = await h.service.abrir({
        codigoFun: 'FUN12345678900',
        tipo: 'MENSAL',
        competencia: '2026-05',
        abertaPor: 'coord-1',
      })
      await h.service.processar({ folhaId: aberta.id, usuarioId: 'coord-1' })

      const aprovada = await h.service.aprovar({ folhaId: aberta.id, usuarioId: 'coord-2' })

      expect(aprovada.status).toBe('APROVADA')
      expect(aprovada.aprovadaPor).toBe('coord-2')
      expect(h.events.byType('FolhaAprovada')).toHaveLength(1)
    })

    it('rejeita aprovação de folha ABERTA (sem processar)', async () => {
      const aberta = await h.service.abrir({
        codigoFun: 'FUN12345678900',
        tipo: 'MENSAL',
        competencia: '2026-05',
        abertaPor: 'coord-1',
      })

      await expect(h.service.aprovar({ folhaId: aberta.id, usuarioId: 'coord-2' })).rejects.toThrow(
        FolhaStatusInvalidoError,
      )
    })

    it('rejeita rejeição sem justificativa adequada', async () => {
      const aberta = await h.service.abrir({
        codigoFun: 'FUN12345678900',
        tipo: 'MENSAL',
        competencia: '2026-05',
        abertaPor: 'coord-1',
      })
      await h.service.processar({ folhaId: aberta.id, usuarioId: 'coord-1' })

      await expect(
        h.service.rejeitar({
          folhaId: aberta.id,
          usuarioId: 'coord-2',
          justificativa: 'oi',
        }),
      ).rejects.toThrow(JustificativaRejeicaoObrigatoriaError)
    })

    it('rejeita folha PROCESSADA com justificativa', async () => {
      const aberta = await h.service.abrir({
        codigoFun: 'FUN12345678900',
        tipo: 'MENSAL',
        competencia: '2026-05',
        abertaPor: 'coord-1',
      })
      await h.service.processar({ folhaId: aberta.id, usuarioId: 'coord-1' })

      const rejeitada = await h.service.rejeitar({
        folhaId: aberta.id,
        usuarioId: 'coord-2',
        justificativa: 'Falta lançar hora extra',
      })

      expect(rejeitada.status).toBe('REJEITADA')
      expect(rejeitada.justificativaRejeicao).toBe('Falta lançar hora extra')
      expect(h.events.byType('FolhaRejeitada')).toHaveLength(1)
    })
  })

  describe('confirmarPagamento e fechar', () => {
    async function chegarAteAprovada() {
      const aberta = await h.service.abrir({
        codigoFun: 'FUN12345678900',
        tipo: 'MENSAL',
        competencia: '2026-05',
        abertaPor: 'coord-1',
      })
      await h.service.processar({ folhaId: aberta.id, usuarioId: 'coord-1' })
      await h.service.aprovar({ folhaId: aberta.id, usuarioId: 'coord-2' })
      return aberta.id
    }

    it('confirma pagamento de folha APROVADA', async () => {
      const id = await chegarAteAprovada()
      const paga = await h.service.confirmarPagamento({ folhaId: id, usuarioId: 'admin-1' })

      expect(paga.status).toBe('PAGA')
      expect(paga.pagaPor).toBe('admin-1')
      expect(h.events.byType('FolhaPaga')).toHaveLength(1)
    })

    it('fecha folha PAGA — torna imutável', async () => {
      const id = await chegarAteAprovada()
      await h.service.confirmarPagamento({ folhaId: id, usuarioId: 'admin-1' })
      const fechada = await h.service.fechar({ folhaId: id, usuarioId: 'admin-1' })

      expect(fechada.status).toBe('FECHADA')
      expect(h.events.byType('FolhaFechada')).toHaveLength(1)

      // Não aceita nenhuma operação após fechar
      await expect(
        h.service.lancarVerba({
          folhaId: id,
          codigo: '002',
          valor: 100,
          usuarioId: 'admin-1',
        }),
      ).rejects.toThrow(FolhaImutavelError)
    })

    it('rejeita confirmar pagamento de folha não APROVADA', async () => {
      const aberta = await h.service.abrir({
        codigoFun: 'FUN12345678900',
        tipo: 'MENSAL',
        competencia: '2026-05',
        abertaPor: 'coord-1',
      })

      await expect(
        h.service.confirmarPagamento({ folhaId: aberta.id, usuarioId: 'admin-1' }),
      ).rejects.toThrow(FolhaStatusInvalidoError)
    })

    it('rejeita fechar folha não PAGA', async () => {
      const id = await chegarAteAprovada()
      await expect(h.service.fechar({ folhaId: id, usuarioId: 'admin-1' })).rejects.toThrow(
        FolhaStatusInvalidoError,
      )
    })
  })

  describe('consultas', () => {
    it('buscar por id retorna folha existente', async () => {
      const aberta = await h.service.abrir({
        codigoFun: 'FUN12345678900',
        tipo: 'MENSAL',
        competencia: '2026-05',
        abertaPor: 'coord-1',
      })
      const found = await h.service.buscarPorId(aberta.id)
      expect(found.codigo).toBe(aberta.codigo)
    })

    it('buscar por id inexistente lança FolhaNaoEncontradaError', async () => {
      await expect(h.service.buscarPorId('507f1f77bcf86cd799439011')).rejects.toThrow(
        FolhaNaoEncontradaError,
      )
    })

    it('listar com filtro de codigoFun e competencia', async () => {
      await h.service.abrir({
        codigoFun: 'FUN12345678900',
        tipo: 'MENSAL',
        competencia: '2026-05',
        abertaPor: 'coord-1',
      })
      await h.service.abrir({
        codigoFun: 'FUN12345678900',
        tipo: 'ADIANTAMENTO',
        competencia: '2026-05',
        abertaPor: 'coord-1',
      })
      const result = await h.service.listar({ codigoFun: 'FUN12345678900' }, 1, 20)
      expect(result.total).toBe(2)
      expect(result.items).toHaveLength(2)
    })

    it('buscarHolerite retorna MENSAL da competência', async () => {
      const aberta = await h.service.abrir({
        codigoFun: 'FUN12345678900',
        tipo: 'MENSAL',
        competencia: '2026-05',
        abertaPor: 'coord-1',
      })
      const holerite = await h.service.buscarHolerite('FUN12345678900', '2026-05')
      expect(holerite.codigo).toBe(aberta.codigo)
    })

    it('buscarHolerite cai pra ADIANTAMENTO quando não há MENSAL', async () => {
      const aberta = await h.service.abrir({
        codigoFun: 'FUN12345678900',
        tipo: 'ADIANTAMENTO',
        competencia: '2026-05',
        abertaPor: 'coord-1',
      })
      const holerite = await h.service.buscarHolerite('FUN12345678900', '2026-05')
      expect(holerite.codigo).toBe(aberta.codigo)
    })
  })
})
