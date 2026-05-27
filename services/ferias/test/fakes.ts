import { ObjectId } from 'mongodb'

import { CLT_CONSTANTES } from '../src/modules/domain/clt-rules.js'
import { addMeses } from '../src/modules/domain/entities/periodo-aquisitivo.js'
import type { Auditoria, CreateAuditoriaInput } from '../src/modules/domain/entities/auditoria.js'
import type {
  CreatePeriodoAquisitivoInput,
  PeriodoAquisitivo,
  PeriodoAquisitivoStatus,
} from '../src/modules/domain/entities/periodo-aquisitivo.js'
import type {
  CreatePeriodoGozoInput,
  PeriodoGozo,
  PeriodoGozoStatus,
} from '../src/modules/domain/entities/periodo-gozo.js'
import type {
  CreateSolicitacaoFeriasInput,
  SolicitacaoFerias,
  SolicitacaoStatus,
} from '../src/modules/domain/entities/solicitacao-ferias.js'
import type {
  ListSolicitacoesFilter,
  ListSolicitacoesPage,
} from '../src/modules/repositories/solicitacao-ferias.repository.js'

/**
 * Reproduções in-memory dos repositórios de produção. Implementam a mesma
 * superfície pública usada pelos services para que sejam injetáveis via
 * `as unknown as RepoReal`. Mantemos as classes minimalistas — qualquer
 * comportamento de banco que importe pra teste (filtros condicionais, lock
 * de status na transição) está reproduzido.
 */

export class FakePeriodoAquisitivoRepository {
  readonly docs = new Map<string, PeriodoAquisitivo>()

  async create(input: CreatePeriodoAquisitivoInput): Promise<PeriodoAquisitivo> {
    const now = new Date()
    const diasDevidos = input.diasDevidos ?? CLT_CONSTANTES.DIAS_DIREITO
    const dataFim = addMeses(input.dataInicio, CLT_CONSTANTES.PERIODO_AQUISITIVO_MESES)
    const dataLimiteGozo = addMeses(dataFim, CLT_CONSTANTES.PERIODO_CONCESSIVO_MESES)
    const status: PeriodoAquisitivoStatus =
      dataFim.getTime() <= now.getTime() ? 'DISPONIVEL' : 'EM_CURSO'

    const doc: PeriodoAquisitivo = {
      _id: new ObjectId(),
      funcionarioId: input.funcionarioId,
      codigoFun: input.codigoFun,
      dataInicio: input.dataInicio,
      dataFim,
      dataLimiteGozo,
      diasDevidos,
      diasGozados: 0,
      diasVendidos: 0,
      saldoDias: diasDevidos,
      status,
      createdAt: now,
      updatedAt: now,
    }
    this.docs.set(doc._id.toHexString(), doc)
    return doc
  }

  insertSeed(doc: PeriodoAquisitivo): void {
    this.docs.set(doc._id.toHexString(), doc)
  }

  async findById(id: string | ObjectId): Promise<PeriodoAquisitivo | null> {
    const key = typeof id === 'string' ? id : id.toHexString()
    return this.docs.get(key) ?? null
  }

  async findVigentePorFuncionario(funcionarioId: string): Promise<PeriodoAquisitivo | null> {
    const candidatos = [...this.docs.values()]
      .filter((d) => d.funcionarioId === funcionarioId)
      .filter((d) => d.status === 'DISPONIVEL' || d.status === 'EM_GOZO')
      .sort((a, b) => b.dataInicio.getTime() - a.dataInicio.getTime())
    return candidatos[0] ?? null
  }

  async listPorFuncionario(funcionarioId: string): Promise<PeriodoAquisitivo[]> {
    return [...this.docs.values()]
      .filter((d) => d.funcionarioId === funcionarioId)
      .sort((a, b) => b.dataInicio.getTime() - a.dataInicio.getTime())
  }

  async debitarSaldo(id: string | ObjectId, diasGozo: number, diasAbono: number): Promise<boolean> {
    const key = typeof id === 'string' ? id : id.toHexString()
    const doc = this.docs.get(key)
    if (!doc) return false
    if (doc.status !== 'DISPONIVEL' && doc.status !== 'EM_GOZO') return false
    const novoGozados = doc.diasGozados + diasGozo
    const novoVendidos = doc.diasVendidos + diasAbono
    const novoSaldo = doc.diasDevidos - novoGozados - novoVendidos
    const novoStatus: PeriodoAquisitivoStatus = novoSaldo > 0 ? 'EM_GOZO' : 'ENCERRADO'
    this.docs.set(key, {
      ...doc,
      diasGozados: novoGozados,
      diasVendidos: novoVendidos,
      saldoDias: novoSaldo,
      status: novoStatus,
      updatedAt: new Date(),
    })
    return true
  }

  async creditarSaldo(
    id: string | ObjectId,
    diasGozo: number,
    diasAbono: number,
  ): Promise<boolean> {
    const key = typeof id === 'string' ? id : id.toHexString()
    const doc = this.docs.get(key)
    if (!doc) return false
    const novoGozados = Math.max(0, doc.diasGozados - diasGozo)
    const novoVendidos = Math.max(0, doc.diasVendidos - diasAbono)
    const novoSaldo = doc.diasDevidos - novoGozados - novoVendidos
    const podeVoltar = doc.dataLimiteGozo.getTime() > Date.now()
    const novoStatus: PeriodoAquisitivoStatus = podeVoltar
      ? novoSaldo > 0
        ? 'DISPONIVEL'
        : doc.status
      : doc.status
    this.docs.set(key, {
      ...doc,
      diasGozados: novoGozados,
      diasVendidos: novoVendidos,
      saldoDias: novoSaldo,
      status: novoStatus,
      updatedAt: new Date(),
    })
    return true
  }

  async atualizarStatus(
    id: string | ObjectId,
    from: PeriodoAquisitivoStatus,
    to: PeriodoAquisitivoStatus,
  ): Promise<boolean> {
    const key = typeof id === 'string' ? id : id.toHexString()
    const doc = this.docs.get(key)
    if (!doc || doc.status !== from) return false
    this.docs.set(key, { ...doc, status: to, updatedAt: new Date() })
    return true
  }

  async listarParaPromoverDisponivel(hoje: Date): Promise<PeriodoAquisitivo[]> {
    return [...this.docs.values()].filter(
      (d) => d.status === 'EM_CURSO' && d.dataFim.getTime() <= hoje.getTime(),
    )
  }

  async listarVencidos(hoje: Date): Promise<PeriodoAquisitivo[]> {
    return [...this.docs.values()].filter(
      (d) =>
        (d.status === 'EM_CURSO' || d.status === 'DISPONIVEL' || d.status === 'EM_GOZO') &&
        d.dataLimiteGozo.getTime() < hoje.getTime(),
    )
  }

  async listarVencendoEm(hoje: Date, diasAFrente: number): Promise<PeriodoAquisitivo[]> {
    const ms = 24 * 60 * 60 * 1000
    const inicioJanela = new Date(hoje.getTime() + diasAFrente * ms).getTime()
    const fimJanela = inicioJanela + ms
    return [...this.docs.values()].filter(
      (d) =>
        (d.status === 'DISPONIVEL' || d.status === 'EM_GOZO') &&
        d.dataLimiteGozo.getTime() >= inicioJanela &&
        d.dataLimiteGozo.getTime() < fimJanela,
    )
  }
}

export class FakeSolicitacaoFeriasRepository {
  readonly docs = new Map<string, SolicitacaoFerias>()

  async create(input: CreateSolicitacaoFeriasInput): Promise<SolicitacaoFerias> {
    const now = new Date()
    const doc: SolicitacaoFerias = {
      _id: new ObjectId(),
      codigo: input.codigo,
      codigoFun: input.codigoFun,
      funcionarioId: input.funcionarioId,
      periodoAquisitivoId: input.periodoAquisitivoId,
      periodoGozoId: null,
      dataInicio: input.dataInicio,
      dataFim: input.dataFim,
      diasSolicitados: input.diasSolicitados,
      abonoPecuniario: input.abonoPecuniario,
      diasAbono: input.diasAbono,
      status: 'PENDENTE',
      justificativaRejeicao: null,
      motivoCancelamento: null,
      aprovadoPor: null,
      aprovadoEm: null,
      canceladoPor: null,
      canceladoEm: null,
      solicitadoPor: input.solicitadoPor,
      createdAt: now,
      updatedAt: now,
    }
    this.docs.set(doc._id.toHexString(), doc)
    return doc
  }

  insertSeed(doc: SolicitacaoFerias): void {
    this.docs.set(doc._id.toHexString(), doc)
  }

  async findById(id: string | ObjectId): Promise<SolicitacaoFerias | null> {
    const key = typeof id === 'string' ? id : id.toHexString()
    return this.docs.get(key) ?? null
  }

  async findByCodigo(codigo: string): Promise<SolicitacaoFerias | null> {
    return [...this.docs.values()].find((d) => d.codigo === codigo) ?? null
  }

  async list(
    filter: ListSolicitacoesFilter,
    page: number,
    limit: number,
  ): Promise<ListSolicitacoesPage> {
    const filtered = [...this.docs.values()].filter((d) => {
      if (filter.status && d.status !== filter.status) return false
      if (filter.funcionarioId && d.funcionarioId !== filter.funcionarioId) return false
      if (filter.periodoAquisitivoId) {
        const expected =
          typeof filter.periodoAquisitivoId === 'string'
            ? filter.periodoAquisitivoId
            : filter.periodoAquisitivoId.toHexString()
        if (d.periodoAquisitivoId.toHexString() !== expected) return false
      }
      return true
    })
    filtered.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    const skip = (page - 1) * limit
    const items = filtered.slice(skip, skip + limit)
    const total = filtered.length
    return {
      items,
      total,
      page,
      limit,
      pages: Math.max(1, Math.ceil(total / limit)),
    }
  }

  async contarFracoesNoAquisitivo(periodoAquisitivoId: string | ObjectId): Promise<number> {
    const expected =
      typeof periodoAquisitivoId === 'string'
        ? periodoAquisitivoId
        : periodoAquisitivoId.toHexString()
    return [...this.docs.values()].filter(
      (d) =>
        d.periodoAquisitivoId.toHexString() === expected &&
        (d.status === 'PENDENTE' || d.status === 'APROVADA'),
    ).length
  }

  async aprovar(
    id: string | ObjectId,
    aprovadoPor: string,
    periodoGozoId: ObjectId,
  ): Promise<boolean> {
    const key = typeof id === 'string' ? id : id.toHexString()
    const doc = this.docs.get(key)
    if (!doc || doc.status !== 'PENDENTE') return false
    const now = new Date()
    this.docs.set(key, {
      ...doc,
      status: 'APROVADA',
      aprovadoPor,
      aprovadoEm: now,
      periodoGozoId,
      updatedAt: now,
    })
    return true
  }

  async rejeitar(
    id: string | ObjectId,
    aprovadoPor: string,
    justificativa: string,
  ): Promise<boolean> {
    const key = typeof id === 'string' ? id : id.toHexString()
    const doc = this.docs.get(key)
    if (!doc || doc.status !== 'PENDENTE') return false
    const now = new Date()
    this.docs.set(key, {
      ...doc,
      status: 'REJEITADA',
      aprovadoPor,
      aprovadoEm: now,
      justificativaRejeicao: justificativa,
      updatedAt: now,
    })
    return true
  }

  async cancelar(
    id: string | ObjectId,
    canceladoPor: string,
    motivo: string,
    statusAceitos: readonly SolicitacaoStatus[],
  ): Promise<boolean> {
    const key = typeof id === 'string' ? id : id.toHexString()
    const doc = this.docs.get(key)
    if (!doc || !statusAceitos.includes(doc.status)) return false
    const now = new Date()
    this.docs.set(key, {
      ...doc,
      status: 'CANCELADA',
      canceladoPor,
      canceladoEm: now,
      motivoCancelamento: motivo,
      updatedAt: now,
    })
    return true
  }
}

export class FakePeriodoGozoRepository {
  readonly docs = new Map<string, PeriodoGozo>()

  async create(input: CreatePeriodoGozoInput): Promise<PeriodoGozo> {
    const now = new Date()
    const doc: PeriodoGozo = {
      _id: new ObjectId(),
      funcionarioId: input.funcionarioId,
      codigoFun: input.codigoFun,
      periodoAquisitivoId: input.periodoAquisitivoId,
      solicitacaoId: input.solicitacaoId,
      dataInicio: input.dataInicio,
      dataFim: input.dataFim,
      diasGozo: input.diasGozo,
      diasAbono: input.diasAbono,
      salarioBruto: input.salarioBruto,
      valorFerias: input.valorFerias,
      valorTerco: input.valorTerco,
      valorAbono: input.valorAbono,
      valorTotal: input.valorTotal,
      dataPagamento: null,
      status: 'AGENDADO',
      createdAt: now,
      updatedAt: now,
    }
    this.docs.set(doc._id.toHexString(), doc)
    return doc
  }

  insertSeed(doc: PeriodoGozo): void {
    this.docs.set(doc._id.toHexString(), doc)
  }

  async findById(id: string | ObjectId): Promise<PeriodoGozo | null> {
    const key = typeof id === 'string' ? id : id.toHexString()
    return this.docs.get(key) ?? null
  }

  async listPorFuncionario(funcionarioId: string): Promise<PeriodoGozo[]> {
    return [...this.docs.values()]
      .filter((d) => d.funcionarioId === funcionarioId)
      .sort((a, b) => b.dataInicio.getTime() - a.dataInicio.getTime())
  }

  async atualizarStatus(
    id: string | ObjectId,
    from: PeriodoGozoStatus,
    to: PeriodoGozoStatus,
  ): Promise<boolean> {
    const key = typeof id === 'string' ? id : id.toHexString()
    const doc = this.docs.get(key)
    if (!doc || doc.status !== from) return false
    this.docs.set(key, { ...doc, status: to, updatedAt: new Date() })
    return true
  }

  async marcarPago(id: string | ObjectId, dataPagamento: Date): Promise<boolean> {
    const key = typeof id === 'string' ? id : id.toHexString()
    const doc = this.docs.get(key)
    if (!doc) return false
    this.docs.set(key, { ...doc, dataPagamento, updatedAt: new Date() })
    return true
  }

  async listarParaIniciar(hoje: Date): Promise<PeriodoGozo[]> {
    return [...this.docs.values()].filter(
      (d) => d.status === 'AGENDADO' && d.dataInicio.getTime() <= hoje.getTime(),
    )
  }

  async listarParaConcluir(hoje: Date): Promise<PeriodoGozo[]> {
    return [...this.docs.values()].filter(
      (d) => d.status === 'EM_GOZO' && d.dataFim.getTime() < hoje.getTime(),
    )
  }

  async recalcularValoresAgendados(
    funcionarioId: string,
    novoSalarioBruto: number,
    calcular: (input: { salarioBruto: number; diasGozo: number; diasAbono: number }) => {
      valorFerias: number
      valorTerco: number
      valorAbono: number
      valorTotal: number
    },
  ): Promise<number> {
    let atualizados = 0
    for (const [key, doc] of this.docs) {
      if (doc.funcionarioId !== funcionarioId || doc.status !== 'AGENDADO') continue
      const novo = calcular({
        salarioBruto: novoSalarioBruto,
        diasGozo: doc.diasGozo,
        diasAbono: doc.diasAbono,
      })
      this.docs.set(key, {
        ...doc,
        salarioBruto: novoSalarioBruto,
        valorFerias: novo.valorFerias,
        valorTerco: novo.valorTerco,
        valorAbono: novo.valorAbono,
        valorTotal: novo.valorTotal,
        updatedAt: new Date(),
      })
      atualizados++
    }
    return atualizados
  }
}

export class FakeContadorRepository {
  private readonly counters = new Map<string, number>()

  async proximoValor(id: string): Promise<number> {
    const next = (this.counters.get(id) ?? 0) + 1
    this.counters.set(id, next)
    return next
  }
}

export class FakeAuditoriaRepository {
  readonly docs: Auditoria[] = []

  async create(input: CreateAuditoriaInput): Promise<Auditoria> {
    const doc: Auditoria = {
      _id: new ObjectId(),
      usuarioId: input.usuarioId,
      acao: input.acao,
      recurso: input.recurso,
      recursoId: input.recursoId,
      valorAnterior: input.valorAnterior ?? null,
      valorNovo: input.valorNovo ?? null,
      ip: input.ip ?? null,
      userAgent: input.userAgent ?? null,
      createdAt: new Date(),
    }
    this.docs.push(doc)
    return doc
  }

  async listPorRecurso(recurso: string, recursoId: string, limit = 50): Promise<Auditoria[]> {
    return this.docs
      .filter((d) => d.recurso === recurso && d.recursoId === recursoId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, limit)
  }
}
