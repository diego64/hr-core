import type { EventPublisher } from '../../infrastructure/messaging/event-publisher.js'
import { processarFolha } from '../domain/calculo-liquido.js'
import type { ItemFolha, PublicFolha } from '../domain/entities/folha.js'
import { toPublicFolha } from '../domain/entities/folha.js'
import {
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
import { gerarCodigoFolha } from '../domain/value-objects/codigo-folha.js'
import { validarCompetencia } from '../domain/value-objects/competencia.js'
import type { StatusFolha } from '../domain/value-objects/status-folha.js'
import type { TipoFolha } from '../domain/value-objects/tipo-folha.js'
import {
  isVerbaAutomatica,
  isVerbaConhecida,
  tipoDaVerba,
  descricaoDaVerba,
} from '../domain/verbas-catalogo.js'
import { validarTransicaoFolha } from '../domain/workflow/transicao-folha.js'
import type { FolhaRepository, ListFolhasFilter } from '../repositories/folha.repository.js'
import type { ContadorRepository } from '../repositories/contador.repository.js'
import type { FuncionarioCacheRepository } from '../repositories/funcionario-cache.repository.js'
import type { AuditoriaService } from './auditoria.service.js'

const JUSTIFICATIVA_MINIMA = 3

export interface AbrirFolhaInput {
  readonly codigoFun: string
  readonly tipo: TipoFolha
  readonly competencia: string
  readonly abertaPor: string
  readonly ip?: string | null
  readonly userAgent?: string | null
}

export interface LancarVerbaInput {
  readonly folhaId: string
  readonly codigo: string
  readonly valor: number
  readonly descricao?: string | null
  readonly referencia?: string | null
  readonly usuarioId: string
  readonly ip?: string | null
  readonly userAgent?: string | null
}

export interface RemoverVerbaInput {
  readonly folhaId: string
  readonly codigoVerba: string
  readonly usuarioId: string
  readonly ip?: string | null
  readonly userAgent?: string | null
}

export interface ProcessarFolhaInput {
  readonly folhaId: string
  readonly usuarioId: string
  readonly ip?: string | null
  readonly userAgent?: string | null
}

export interface AprovarFolhaInput {
  readonly folhaId: string
  readonly usuarioId: string
  readonly ip?: string | null
  readonly userAgent?: string | null
}

export interface RejeitarFolhaInput {
  readonly folhaId: string
  readonly usuarioId: string
  readonly justificativa: string
  readonly ip?: string | null
  readonly userAgent?: string | null
}

export interface ConfirmarPagamentoInput {
  readonly folhaId: string
  readonly usuarioId: string
  readonly ip?: string | null
  readonly userAgent?: string | null
}

export interface FecharFolhaInput {
  readonly folhaId: string
  readonly usuarioId: string
  readonly ip?: string | null
  readonly userAgent?: string | null
}

export class FolhaService {
  constructor(
    private readonly repo: FolhaRepository,
    private readonly funcionarioRepo: FuncionarioCacheRepository,
    private readonly contadorRepo: ContadorRepository,
    private readonly auditoria: AuditoriaService,
    private readonly events: EventPublisher,
  ) {}

  // ─── abrir ────────────────────────────────────────────────────────────
  async abrir(input: AbrirFolhaInput): Promise<PublicFolha> {
    validarCompetencia(input.competencia, input.tipo)

    const funcionario = await this.funcionarioRepo.findByCodigoFun(input.codigoFun)
    if (!funcionario) throw new FuncionarioCacheNaoEncontradoError(input.codigoFun)
    if (!funcionario.ativo) throw new FuncionarioInativoError(input.codigoFun)
    if (funcionario.salarioBase <= 0) throw new SalarioNaoInformadoError(input.codigoFun)

    const sequencia = await this.contadorRepo.proximoValor('FOLHA')
    const codigo = gerarCodigoFolha(sequencia)

    const created = await this.repo.create({
      codigo,
      codigoFun: funcionario.codigoFun,
      funcionarioId: funcionario._id,
      tipo: input.tipo,
      competencia: input.competencia,
      salarioBase: funcionario.salarioBase,
      numeroDependentes: funcionario.numeroDependentes,
      abertaPor: input.abertaPor,
    })

    await this.auditoria.registrar({
      usuarioId: input.abertaPor,
      acao: 'FOLHA_ABERTA',
      recurso: 'folhas',
      recursoId: created._id.toHexString(),
      valorAnterior: null,
      valorNovo: { status: 'ABERTA', codigo, tipo: input.tipo, competencia: input.competencia },
      ip: input.ip ?? null,
      userAgent: input.userAgent ?? null,
    })

    await this.events.publish({
      eventType: 'FolhaAberta',
      aggregateId: funcionario._id,
      payload: {
        folhaId: created._id.toHexString(),
        codigo,
        codigoFun: funcionario.codigoFun,
        tipo: input.tipo,
        competencia: input.competencia,
      },
    })

    return toPublicFolha(created)
  }

  // ─── lançar verba ────────────────────────────────────────────────────
  async lancarVerba(input: LancarVerbaInput): Promise<PublicFolha> {
    const folha = await this.repo.findById(input.folhaId)
    if (!folha) throw new FolhaNaoEncontradaError(input.folhaId)
    if (folha.status === 'FECHADA') throw new FolhaImutavelError()
    if (folha.status !== 'ABERTA') {
      throw new FolhaStatusInvalidoError('lançar verba', folha.status)
    }

    if (!isVerbaConhecida(input.codigo)) {
      throw new VerbaInvalidaError(`Verba com código ${input.codigo} não está catalogada.`)
    }
    if (isVerbaAutomatica(input.codigo)) {
      throw new VerbaInvalidaError(
        `Verba ${input.codigo} é automática (calculada pelo serviço) e não aceita lançamento manual.`,
      )
    }
    if (input.valor < 0) {
      throw new VerbaInvalidaError(`Valor da verba ${input.codigo} não pode ser negativo.`)
    }

    const tipo = tipoDaVerba(input.codigo)
    if (!tipo) {
      throw new VerbaInvalidaError(`Verba ${input.codigo} sem tipo definido no catálogo.`)
    }
    const descricao = input.descricao ?? descricaoDaVerba(input.codigo) ?? input.codigo

    const novoItem: ItemFolha = {
      codigo: input.codigo,
      descricao,
      tipo,
      valor: input.valor,
      ...(input.referencia != null ? { referencia: input.referencia } : {}),
    }

    const proventos =
      tipo === 'PROVENTO' ? upsertItem(folha.proventos, novoItem) : [...folha.proventos]
    const descontos =
      tipo === 'DESCONTO' ? upsertItem(folha.descontos, novoItem) : [...folha.descontos]

    const ok = await this.repo.setProventosDescontos(folha._id, 'ABERTA', proventos, descontos)
    if (!ok) {
      // Race: outro update mudou o status entre o find e o update
      throw new FolhaStatusInvalidoError('lançar verba', folha.status)
    }

    await this.auditoria.registrar({
      usuarioId: input.usuarioId,
      acao: 'FOLHA_VERBA_LANCADA',
      recurso: 'folhas',
      recursoId: folha._id.toHexString(),
      valorAnterior: null,
      valorNovo: { codigo: input.codigo, valor: input.valor, tipo },
      ip: input.ip ?? null,
      userAgent: input.userAgent ?? null,
    })

    const atualizada = await this.repo.findById(folha._id)
    return toPublicFolha(atualizada ?? folha)
  }

  async removerVerba(input: RemoverVerbaInput): Promise<PublicFolha> {
    const folha = await this.repo.findById(input.folhaId)
    if (!folha) throw new FolhaNaoEncontradaError(input.folhaId)
    if (folha.status === 'FECHADA') throw new FolhaImutavelError()
    if (folha.status !== 'ABERTA') {
      throw new FolhaStatusInvalidoError('remover verba', folha.status)
    }

    if (isVerbaAutomatica(input.codigoVerba)) {
      throw new VerbaInvalidaError(
        `Verba ${input.codigoVerba} é automática e não pode ser removida manualmente.`,
      )
    }

    const existeNosProventos = folha.proventos.some((p) => p.codigo === input.codigoVerba)
    const existeNosDescontos = folha.descontos.some((d) => d.codigo === input.codigoVerba)
    if (!existeNosProventos && !existeNosDescontos) {
      throw new VerbaNaoEncontradaError(input.codigoVerba)
    }

    const proventos = folha.proventos.filter((p) => p.codigo !== input.codigoVerba)
    const descontos = folha.descontos.filter((d) => d.codigo !== input.codigoVerba)

    const ok = await this.repo.setProventosDescontos(folha._id, 'ABERTA', proventos, descontos)
    if (!ok) throw new FolhaStatusInvalidoError('remover verba', folha.status)

    await this.auditoria.registrar({
      usuarioId: input.usuarioId,
      acao: 'FOLHA_VERBA_REMOVIDA',
      recurso: 'folhas',
      recursoId: folha._id.toHexString(),
      valorAnterior: { codigo: input.codigoVerba },
      valorNovo: null,
      ip: input.ip ?? null,
      userAgent: input.userAgent ?? null,
    })

    const atualizada = await this.repo.findById(folha._id)
    return toPublicFolha(atualizada ?? folha)
  }

  // ─── processar ────────────────────────────────────────────────────────
  async processar(input: ProcessarFolhaInput): Promise<PublicFolha> {
    const folha = await this.repo.findById(input.folhaId)
    if (!folha) throw new FolhaNaoEncontradaError(input.folhaId)
    if (folha.status === 'FECHADA') throw new FolhaImutavelError()
    if (folha.status !== 'ABERTA' && folha.status !== 'PROCESSADA') {
      throw new FolhaStatusInvalidoError('processar', folha.status)
    }
    // Permite reprocessamento (PROCESSADA → PROCESSADA): validamos a transição
    // alvo (ABERTA → PROCESSADA) só quando vindo de ABERTA.
    if (folha.status === 'ABERTA') validarTransicaoFolha('ABERTA', 'PROCESSADA')

    const calculado = processarFolha({
      salarioBase: folha.salarioBase,
      numeroDependentes: folha.numeroDependentes,
      proventos: folha.proventos,
      descontos: folha.descontos,
    })

    const ok = await this.repo.processar(folha._id, {
      proventos: calculado.proventos,
      descontos: calculado.descontos,
      totalProventos: calculado.totalProventos,
      totalDescontos: calculado.totalDescontos,
      salarioLiquido: calculado.salarioLiquido,
      descontoINSS: calculado.descontoINSS,
      descontoIRRF: calculado.descontoIRRF,
      fgts: calculado.fgts,
      processadaPor: input.usuarioId,
    })
    if (!ok) throw new FolhaStatusInvalidoError('processar', folha.status)

    await this.auditoria.registrar({
      usuarioId: input.usuarioId,
      acao: 'FOLHA_PROCESSADA',
      recurso: 'folhas',
      recursoId: folha._id.toHexString(),
      valorAnterior: { status: folha.status },
      valorNovo: {
        status: 'PROCESSADA',
        salarioLiquido: calculado.salarioLiquido,
        descontoINSS: calculado.descontoINSS,
        descontoIRRF: calculado.descontoIRRF,
        fgts: calculado.fgts,
      },
      ip: input.ip ?? null,
      userAgent: input.userAgent ?? null,
    })

    await this.events.publish({
      eventType: 'FolhaProcessada',
      aggregateId: folha.funcionarioId,
      payload: {
        folhaId: folha._id.toHexString(),
        codigo: folha.codigo,
        salarioLiquido: calculado.salarioLiquido,
        fgts: calculado.fgts,
      },
    })

    const atualizada = await this.repo.findById(folha._id)
    return toPublicFolha(atualizada ?? folha)
  }

  // ─── aprovar / rejeitar ──────────────────────────────────────────────
  async aprovar(input: AprovarFolhaInput): Promise<PublicFolha> {
    const folha = await this.repo.findById(input.folhaId)
    if (!folha) throw new FolhaNaoEncontradaError(input.folhaId)
    if (folha.status === 'FECHADA') throw new FolhaImutavelError()
    if (folha.status !== 'PROCESSADA') throw new FolhaStatusInvalidoError('aprovar', folha.status)

    const ok = await this.repo.aprovar(folha._id, input.usuarioId)
    if (!ok) throw new FolhaStatusInvalidoError('aprovar', folha.status)

    await this.auditoria.registrar({
      usuarioId: input.usuarioId,
      acao: 'FOLHA_APROVADA',
      recurso: 'folhas',
      recursoId: folha._id.toHexString(),
      valorAnterior: { status: 'PROCESSADA' },
      valorNovo: { status: 'APROVADA' },
      ip: input.ip ?? null,
      userAgent: input.userAgent ?? null,
    })

    await this.events.publish({
      eventType: 'FolhaAprovada',
      aggregateId: folha.funcionarioId,
      payload: { folhaId: folha._id.toHexString(), codigo: folha.codigo },
    })

    const atualizada = await this.repo.findById(folha._id)
    return toPublicFolha(atualizada ?? folha)
  }

  async rejeitar(input: RejeitarFolhaInput): Promise<PublicFolha> {
    const justificativa = input.justificativa.trim()
    if (justificativa.length < JUSTIFICATIVA_MINIMA) {
      throw new JustificativaRejeicaoObrigatoriaError()
    }

    const folha = await this.repo.findById(input.folhaId)
    if (!folha) throw new FolhaNaoEncontradaError(input.folhaId)
    if (folha.status === 'FECHADA') throw new FolhaImutavelError()
    if (folha.status !== 'PROCESSADA') throw new FolhaStatusInvalidoError('rejeitar', folha.status)

    const ok = await this.repo.rejeitar(folha._id, input.usuarioId, justificativa)
    if (!ok) throw new FolhaStatusInvalidoError('rejeitar', folha.status)

    await this.auditoria.registrar({
      usuarioId: input.usuarioId,
      acao: 'FOLHA_REJEITADA',
      recurso: 'folhas',
      recursoId: folha._id.toHexString(),
      valorAnterior: { status: 'PROCESSADA' },
      valorNovo: { status: 'REJEITADA', justificativa },
      ip: input.ip ?? null,
      userAgent: input.userAgent ?? null,
    })

    await this.events.publish({
      eventType: 'FolhaRejeitada',
      aggregateId: folha.funcionarioId,
      payload: {
        folhaId: folha._id.toHexString(),
        codigo: folha.codigo,
        justificativa,
      },
    })

    const atualizada = await this.repo.findById(folha._id)
    return toPublicFolha(atualizada ?? folha)
  }

  // ─── confirmar pagamento / fechar ────────────────────────────────────
  async confirmarPagamento(input: ConfirmarPagamentoInput): Promise<PublicFolha> {
    const folha = await this.repo.findById(input.folhaId)
    if (!folha) throw new FolhaNaoEncontradaError(input.folhaId)
    if (folha.status === 'FECHADA') throw new FolhaImutavelError()
    if (folha.status !== 'APROVADA') {
      throw new FolhaStatusInvalidoError('confirmar pagamento', folha.status)
    }

    const ok = await this.repo.confirmarPagamento(folha._id, input.usuarioId)
    if (!ok) throw new FolhaStatusInvalidoError('confirmar pagamento', folha.status)

    await this.auditoria.registrar({
      usuarioId: input.usuarioId,
      acao: 'FOLHA_PAGA',
      recurso: 'folhas',
      recursoId: folha._id.toHexString(),
      valorAnterior: { status: 'APROVADA' },
      valorNovo: { status: 'PAGA' },
      ip: input.ip ?? null,
      userAgent: input.userAgent ?? null,
    })

    await this.events.publish({
      eventType: 'FolhaPaga',
      aggregateId: folha.funcionarioId,
      payload: {
        folhaId: folha._id.toHexString(),
        codigo: folha.codigo,
        salarioLiquido: folha.salarioLiquido,
      },
    })

    const atualizada = await this.repo.findById(folha._id)
    return toPublicFolha(atualizada ?? folha)
  }

  async fechar(input: FecharFolhaInput): Promise<PublicFolha> {
    const folha = await this.repo.findById(input.folhaId)
    if (!folha) throw new FolhaNaoEncontradaError(input.folhaId)
    if (folha.status === 'FECHADA') throw new FolhaImutavelError()
    if (folha.status !== 'PAGA') throw new FolhaStatusInvalidoError('fechar', folha.status)

    const ok = await this.repo.fechar(folha._id, input.usuarioId)
    if (!ok) throw new FolhaStatusInvalidoError('fechar', folha.status)

    await this.auditoria.registrar({
      usuarioId: input.usuarioId,
      acao: 'FOLHA_FECHADA',
      recurso: 'folhas',
      recursoId: folha._id.toHexString(),
      valorAnterior: { status: 'PAGA' },
      valorNovo: { status: 'FECHADA' },
      ip: input.ip ?? null,
      userAgent: input.userAgent ?? null,
    })

    await this.events.publish({
      eventType: 'FolhaFechada',
      aggregateId: folha.funcionarioId,
      payload: { folhaId: folha._id.toHexString(), codigo: folha.codigo },
    })

    const atualizada = await this.repo.findById(folha._id)
    return toPublicFolha(atualizada ?? folha)
  }

  // ─── consultas ───────────────────────────────────────────────────────
  async buscarPorId(id: string): Promise<PublicFolha> {
    const folha = await this.repo.findById(id)
    if (!folha) throw new FolhaNaoEncontradaError(id)
    return toPublicFolha(folha)
  }

  async buscarPorCodigo(codigo: string): Promise<PublicFolha> {
    const folha = await this.repo.findByCodigo(codigo)
    if (!folha) throw new FolhaNaoEncontradaError(codigo)
    return toPublicFolha(folha)
  }

  async listar(
    filter: ListFolhasFilter,
    page: number,
    limit: number,
  ): Promise<{ items: PublicFolha[]; total: number; page: number; limit: number; pages: number }> {
    const result = await this.repo.list(filter, page, limit)
    return {
      items: result.items.map(toPublicFolha),
      total: result.total,
      page: result.page,
      limit: result.limit,
      pages: result.pages,
    }
  }

  async buscarHolerite(codigoFun: string, competencia: string): Promise<PublicFolha> {
    // Holerite é a folha MENSAL da competência. Se não houver MENSAL, tenta
    // ADIANTAMENTO como fallback (cobre a 1ª quinzena).
    const mensal = await this.repo.findByFuncionarioCompetencia(codigoFun, 'MENSAL', competencia)
    if (mensal) return toPublicFolha(mensal)
    const adiantamento = await this.repo.findByFuncionarioCompetencia(
      codigoFun,
      'ADIANTAMENTO',
      competencia,
    )
    if (adiantamento) return toPublicFolha(adiantamento)
    throw new FolhaNaoEncontradaError(`${codigoFun}@${competencia}`)
  }

  // Ajuste de status inicial inválido sentinela — força exhaustiveness check
  // sobre todos os StatusFolha mesmo que nada use isso hoje.
  static assertEsgotamentoStatus(status: never): never {
    throw new Error(`StatusFolha não tratado: ${String(status)}`)
  }
}

function upsertItem(items: readonly ItemFolha[], novo: ItemFolha): ItemFolha[] {
  const idx = items.findIndex((i) => i.codigo === novo.codigo)
  if (idx === -1) return [...items, novo]
  const clone = [...items]
  clone[idx] = novo
  return clone
}

export { type StatusFolha }
