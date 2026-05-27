import { ObjectId } from 'mongodb'

import {
  CancelamentoInvalidoError,
  JustificativaObrigatoriaError,
  SolicitacaoNaoEncontradaError,
  SolicitacaoNaoPendenteError,
} from '../domain/errors/domain-error.js'
import {
  CLT_CONSTANTES,
  calcularDiasSolicitados,
  validarSolicitacaoFerias,
} from '../domain/clt-rules.js'
import { calcularFerias } from '../domain/calculo-ferias.js'
import {
  toPublicSolicitacaoFerias,
  type PublicSolicitacaoFerias,
} from '../domain/entities/solicitacao-ferias.js'
import { gerarCodigoFerias } from '../domain/value-objects/codigo-ferias.js'
import { validarTransicaoSolicitacao } from '../domain/workflow/transicao-solicitacao.js'
import type { EventPublisher } from '../../infrastructure/messaging/event-publisher.js'
import type { ContadorRepository } from '../repositories/contador.repository.js'
import type {
  ListSolicitacoesFilter,
  SolicitacaoFeriasRepository,
} from '../repositories/solicitacao-ferias.repository.js'
import type { PeriodoAquisitivoRepository } from '../repositories/periodo-aquisitivo.repository.js'
import type { PeriodoGozoRepository } from '../repositories/periodo-gozo.repository.js'
import type { AuditoriaService } from './auditoria.service.js'
import type { PeriodoAquisitivoService } from './periodo-aquisitivo.service.js'

export interface CriarSolicitacaoInput {
  readonly funcionarioId: string
  readonly dataInicio: Date
  readonly dataFim: Date
  readonly abonoPecuniario: boolean
  readonly diasAbono: number
  readonly solicitadoPor: string
  /**
   * Lista de feriados/DSR relevantes pra validar a vedação de início nas
   * "2 vésperas". Hoje é o caller que passa (normalmente lista vazia + a
   * lógica de domingo); futuramente, um workalendar (hapi-pt-BR-holidays etc.).
   */
  readonly feriadosOuDsr?: readonly Date[]
}

export interface AprovarSolicitacaoInput {
  readonly id: string
  readonly aprovadoPor: string
  readonly salarioBruto: number
  readonly ip?: string | null
  readonly userAgent?: string | null
}

export interface RejeitarSolicitacaoInput {
  readonly id: string
  readonly aprovadoPor: string
  readonly justificativa: string
  readonly ip?: string | null
  readonly userAgent?: string | null
}

export interface CancelarSolicitacaoInput {
  readonly id: string
  readonly canceladoPor: string
  readonly motivo: string
  readonly papelDoCallerEhAdmin: boolean
  readonly ip?: string | null
  readonly userAgent?: string | null
}

const RECURSO = 'solicitacoes_ferias'

export class SolicitacaoFeriasService {
  constructor(
    private readonly repo: SolicitacaoFeriasRepository,
    private readonly aquisitivoRepo: PeriodoAquisitivoRepository,
    private readonly gozoRepo: PeriodoGozoRepository,
    private readonly contadorRepo: ContadorRepository,
    private readonly aquisitivoService: PeriodoAquisitivoService,
    private readonly auditoria: AuditoriaService,
    private readonly events: EventPublisher,
  ) {}

  // ─── CRIAR ────────────────────────────────────────────────────────────
  async criar(input: CriarSolicitacaoInput): Promise<PublicSolicitacaoFerias> {
    const aquisitivo = await this.aquisitivoService.carregarVigenteRaw(input.funcionarioId)

    const fracoes = await this.repo.contarFracoesNoAquisitivo(aquisitivo._id)
    validarSolicitacaoFerias({
      periodoAquisitivo: aquisitivo,
      dataInicio: input.dataInicio,
      dataFim: input.dataFim,
      abonoPecuniario: input.abonoPecuniario,
      diasAbono: input.diasAbono,
      fracoesExistentes: fracoes,
      feriadosOuDsr: input.feriadosOuDsr ?? [],
      hoje: new Date(),
    })

    const diasSolicitados = calcularDiasSolicitados(input.dataInicio, input.dataFim)
    const sequencia = await this.contadorRepo.proximoValor('FER')
    const codigo = gerarCodigoFerias(sequencia)

    const created = await this.repo.create({
      codigo,
      codigoFun: aquisitivo.codigoFun,
      funcionarioId: input.funcionarioId,
      periodoAquisitivoId: aquisitivo._id,
      dataInicio: input.dataInicio,
      dataFim: input.dataFim,
      diasSolicitados,
      abonoPecuniario: input.abonoPecuniario,
      diasAbono: input.diasAbono,
      solicitadoPor: input.solicitadoPor,
    })

    await this.auditoria.registrar({
      usuarioId: input.solicitadoPor,
      acao: 'FERIAS_SOLICITADAS',
      recurso: RECURSO,
      recursoId: created._id.toHexString(),
      valorAnterior: null,
      valorNovo: { status: 'PENDENTE', codigo },
    })

    await this.events.publish({
      eventType: 'FeriasSolicitadas',
      aggregateId: input.funcionarioId,
      payload: {
        solicitacaoId: created._id.toHexString(),
        codigo,
        diasSolicitados,
        abonoPecuniario: input.abonoPecuniario,
        diasAbono: input.diasAbono,
        dataInicio: input.dataInicio.toISOString(),
        dataFim: input.dataFim.toISOString(),
      },
    })

    return toPublicSolicitacaoFerias(created)
  }

  // ─── APROVAR ──────────────────────────────────────────────────────────
  async aprovar(input: AprovarSolicitacaoInput): Promise<PublicSolicitacaoFerias> {
    const solicitacao = await this.repo.findById(input.id)
    if (!solicitacao) throw new SolicitacaoNaoEncontradaError(input.id)
    if (solicitacao.status !== 'PENDENTE') {
      throw new SolicitacaoNaoPendenteError(solicitacao.status)
    }
    validarTransicaoSolicitacao('PENDENTE', 'APROVADA')

    const aquisitivo = await this.aquisitivoRepo.findById(solicitacao.periodoAquisitivoId)
    if (!aquisitivo) {
      throw new SolicitacaoNaoEncontradaError(input.id) // defesa em profundidade
    }

    // Calcula valores financeiros baseado no salário snapshot.
    const valores = calcularFerias({
      salarioBruto: input.salarioBruto,
      diasGozo: solicitacao.diasSolicitados,
      diasAbono: solicitacao.diasAbono,
    })

    // Cria o PeriodoGozo (AGENDADO) e marca a solicitação como APROVADA.
    const gozo = await this.gozoRepo.create({
      funcionarioId: solicitacao.funcionarioId,
      codigoFun: solicitacao.codigoFun,
      periodoAquisitivoId: solicitacao.periodoAquisitivoId,
      solicitacaoId: solicitacao._id,
      dataInicio: solicitacao.dataInicio,
      dataFim: solicitacao.dataFim,
      diasGozo: solicitacao.diasSolicitados,
      diasAbono: solicitacao.diasAbono,
      salarioBruto: input.salarioBruto,
      valorFerias: valores.valorFerias,
      valorTerco: valores.valorTerco,
      valorAbono: valores.valorAbono,
      valorTotal: valores.valorTotal,
    })

    const ok = await this.repo.aprovar(solicitacao._id, input.aprovadoPor, gozo._id)
    if (!ok) {
      // Race com outro aprovador — desfaz o gozo recém-criado pra manter
      // consistência (idempotência de aprovação).
      await this.gozoRepo.atualizarStatus(gozo._id, 'AGENDADO', 'CANCELADO')
      throw new SolicitacaoNaoPendenteError('APROVADA')
    }

    await this.aquisitivoRepo.debitarSaldo(
      aquisitivo._id,
      solicitacao.diasSolicitados,
      solicitacao.diasAbono,
    )

    await this.auditoria.registrar({
      usuarioId: input.aprovadoPor,
      acao: 'FERIAS_APROVADAS',
      recurso: RECURSO,
      recursoId: solicitacao._id.toHexString(),
      valorAnterior: { status: 'PENDENTE' },
      valorNovo: { status: 'APROVADA', periodoGozoId: gozo._id.toHexString() },
      ip: input.ip ?? null,
      userAgent: input.userAgent ?? null,
    })

    await this.events.publish({
      eventType: 'FeriasAprovadas',
      aggregateId: solicitacao.funcionarioId,
      payload: {
        solicitacaoId: solicitacao._id.toHexString(),
        periodoGozoId: gozo._id.toHexString(),
        valorTotal: valores.valorTotal,
      },
    })

    const atualizada = await this.repo.findById(solicitacao._id)
    return toPublicSolicitacaoFerias(atualizada!) // garantido — acabou de existir
  }

  // ─── REJEITAR ─────────────────────────────────────────────────────────
  async rejeitar(input: RejeitarSolicitacaoInput): Promise<PublicSolicitacaoFerias> {
    if (!input.justificativa || input.justificativa.trim().length < 3) {
      throw new JustificativaObrigatoriaError()
    }
    const solicitacao = await this.repo.findById(input.id)
    if (!solicitacao) throw new SolicitacaoNaoEncontradaError(input.id)
    if (solicitacao.status !== 'PENDENTE') {
      throw new SolicitacaoNaoPendenteError(solicitacao.status)
    }
    validarTransicaoSolicitacao('PENDENTE', 'REJEITADA')

    const ok = await this.repo.rejeitar(solicitacao._id, input.aprovadoPor, input.justificativa)
    if (!ok) throw new SolicitacaoNaoPendenteError('REJEITADA')

    await this.auditoria.registrar({
      usuarioId: input.aprovadoPor,
      acao: 'FERIAS_REJEITADAS',
      recurso: RECURSO,
      recursoId: solicitacao._id.toHexString(),
      valorAnterior: { status: 'PENDENTE' },
      valorNovo: { status: 'REJEITADA', justificativa: input.justificativa },
      ip: input.ip ?? null,
      userAgent: input.userAgent ?? null,
    })

    await this.events.publish({
      eventType: 'FeriasRejeitadas',
      aggregateId: solicitacao.funcionarioId,
      payload: {
        solicitacaoId: solicitacao._id.toHexString(),
        justificativa: input.justificativa,
      },
    })

    const atualizada = await this.repo.findById(solicitacao._id)
    return toPublicSolicitacaoFerias(atualizada!)
  }

  // ─── CANCELAR ─────────────────────────────────────────────────────────
  async cancelar(input: CancelarSolicitacaoInput): Promise<PublicSolicitacaoFerias> {
    const solicitacao = await this.repo.findById(input.id)
    if (!solicitacao) throw new SolicitacaoNaoEncontradaError(input.id)

    // USUARIO: só pode cancelar PRÓPRIA solicitação PENDENTE.
    // ADMINISTRADOR: pode cancelar PENDENTE ou APROVADA (não iniciada ainda).
    if (input.papelDoCallerEhAdmin) {
      if (solicitacao.status !== 'PENDENTE' && solicitacao.status !== 'APROVADA') {
        throw new CancelamentoInvalidoError(
          `Status ${solicitacao.status} não permite cancelamento.`,
        )
      }
    } else {
      if (solicitacao.solicitadoPor !== input.canceladoPor) {
        throw new CancelamentoInvalidoError('USUARIO pode cancelar apenas a própria solicitação.')
      }
      if (solicitacao.status !== 'PENDENTE') {
        throw new CancelamentoInvalidoError(
          'USUARIO pode cancelar apenas solicitações PENDENTE. Peça ao ADMINISTRADOR.',
        )
      }
    }

    const eraAprovada = solicitacao.status === 'APROVADA'
    const aceitos: ReadonlyArray<'PENDENTE' | 'APROVADA'> = eraAprovada
      ? ['APROVADA']
      : ['PENDENTE']
    const ok = await this.repo.cancelar(solicitacao._id, input.canceladoPor, input.motivo, aceitos)
    if (!ok) throw new SolicitacaoNaoPendenteError('CANCELADA')

    if (eraAprovada && solicitacao.periodoGozoId) {
      await this.gozoRepo.atualizarStatus(solicitacao.periodoGozoId, 'AGENDADO', 'CANCELADO')
      await this.aquisitivoRepo.creditarSaldo(
        solicitacao.periodoAquisitivoId,
        solicitacao.diasSolicitados,
        solicitacao.diasAbono,
      )
    }

    await this.auditoria.registrar({
      usuarioId: input.canceladoPor,
      acao: 'FERIAS_CANCELADAS',
      recurso: RECURSO,
      recursoId: solicitacao._id.toHexString(),
      valorAnterior: { status: solicitacao.status },
      valorNovo: { status: 'CANCELADA', motivo: input.motivo },
      ip: input.ip ?? null,
      userAgent: input.userAgent ?? null,
    })

    await this.events.publish({
      eventType: 'FeriasCanceladas',
      aggregateId: solicitacao.funcionarioId,
      payload: {
        solicitacaoId: solicitacao._id.toHexString(),
        statusAnterior: solicitacao.status,
        motivo: input.motivo,
      },
    })

    const atualizada = await this.repo.findById(solicitacao._id)
    return toPublicSolicitacaoFerias(atualizada!)
  }

  // ─── QUERIES ──────────────────────────────────────────────────────────
  async buscarPorId(id: string): Promise<PublicSolicitacaoFerias> {
    const found = await this.repo.findById(id)
    if (!found) throw new SolicitacaoNaoEncontradaError(id)
    return toPublicSolicitacaoFerias(found)
  }

  async listar(
    filter: ListSolicitacoesFilter,
    page: number,
    limit: number,
  ): Promise<{
    items: PublicSolicitacaoFerias[]
    total: number
    page: number
    limit: number
    pages: number
  }> {
    const result = await this.repo.list(filter, page, limit)
    return {
      items: result.items.map(toPublicSolicitacaoFerias),
      total: result.total,
      page: result.page,
      limit: result.limit,
      pages: result.pages,
    }
  }

  /**
   * Mantém referência usada em testes/jobs futuros — não é exposto via HTTP.
   */
  get constantes() {
    return CLT_CONSTANTES
  }
}

// Mantém a re-exportação do ObjectId para uso interno se outro service precisar.
export { ObjectId }
