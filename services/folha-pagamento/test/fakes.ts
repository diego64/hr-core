import { ObjectId } from 'mongodb'

import type { Auditoria, CreateAuditoriaInput } from '../src/modules/domain/entities/auditoria.js'
import type { CreateFolhaInput, Folha, ItemFolha } from '../src/modules/domain/entities/folha.js'
import type {
  FuncionarioCache,
  UpsertFuncionarioCacheInput,
} from '../src/modules/domain/entities/funcionario-cache.js'
import { FolhaCompetenciaDuplicadaError } from '../src/modules/domain/errors/domain-error.js'
import type { StatusFolha } from '../src/modules/domain/value-objects/status-folha.js'
import type { TipoFolha } from '../src/modules/domain/value-objects/tipo-folha.js'
import type {
  AtualizarCalculoInput,
  ListFolhasFilter,
  ListFolhasPage,
} from '../src/modules/repositories/folha.repository.js'

/**
 * Fakes em memória dos repositórios pra testes unitários do service.
 * Espelham EXATAMENTE a interface pública das classes reais.
 */

export class FakeContadorRepository {
  private readonly contadores = new Map<string, number>()

  async proximoValor(id: string): Promise<number> {
    const next = (this.contadores.get(id) ?? 0) + 1
    this.contadores.set(id, next)
    return next
  }
}

export class FakeAuditoriaRepository {
  readonly registros: Auditoria[] = []

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
    this.registros.push(doc)
    return doc
  }

  async listPorRecurso(recurso: string, recursoId: string, limit = 50): Promise<Auditoria[]> {
    return this.registros
      .filter((r) => r.recurso === recurso && r.recursoId === recursoId)
      .slice(0, limit)
  }
}

export class FakeFuncionarioCacheRepository {
  readonly items = new Map<string, FuncionarioCache>()

  insert(f: FuncionarioCache): void {
    this.items.set(f._id, f)
  }

  async findByCodigoFun(codigoFun: string): Promise<FuncionarioCache | null> {
    for (const f of this.items.values()) {
      if (f.codigoFun === codigoFun) return f
    }
    return null
  }

  async findByFuncionarioId(funcionarioId: string): Promise<FuncionarioCache | null> {
    return this.items.get(funcionarioId) ?? null
  }

  async upsert(input: UpsertFuncionarioCacheInput): Promise<FuncionarioCache> {
    const doc: FuncionarioCache = {
      _id: input.funcionarioId,
      codigoFun: input.codigoFun,
      nome: input.nome,
      setor: input.setor ?? null,
      salarioBase: input.salarioBase,
      numeroDependentes: input.numeroDependentes,
      ativo: input.ativo,
      updatedAt: new Date(),
    }
    this.items.set(input.funcionarioId, doc)
    return doc
  }

  async marcarInativo(funcionarioId: string): Promise<boolean> {
    const found = this.items.get(funcionarioId)
    if (!found) return false
    this.items.set(funcionarioId, { ...found, ativo: false, updatedAt: new Date() })
    return true
  }
}

export class FakeFolhaRepository {
  readonly items = new Map<string, Folha>()

  insert(folha: Folha): void {
    this.items.set(folha._id.toHexString(), folha)
  }

  async create(input: CreateFolhaInput): Promise<Folha> {
    // Imitando o índice único (codigoFun, tipo, competencia)
    for (const f of this.items.values()) {
      if (
        f.codigoFun === input.codigoFun &&
        f.tipo === input.tipo &&
        f.competencia === input.competencia
      ) {
        throw new FolhaCompetenciaDuplicadaError(input.codigoFun, input.tipo, input.competencia)
      }
    }
    const now = new Date()
    const folha: Folha = {
      _id: new ObjectId(),
      codigo: input.codigo,
      codigoFun: input.codigoFun,
      funcionarioId: input.funcionarioId,
      tipo: input.tipo,
      competencia: input.competencia,
      salarioBase: input.salarioBase,
      numeroDependentes: input.numeroDependentes,
      proventos: input.proventos ?? [],
      descontos: input.descontos ?? [],
      totalProventos: 0,
      totalDescontos: 0,
      salarioLiquido: 0,
      fgts: 0,
      descontoINSS: 0,
      descontoIRRF: 0,
      status: input.statusInicial ?? 'ABERTA',
      processadaPor: null,
      processadaEm: null,
      aprovadaPor: null,
      aprovadaEm: null,
      justificativaRejeicao: null,
      pagaPor: null,
      pagaEm: null,
      fechadaPor: null,
      fechadaEm: null,
      periodoGozoId: input.periodoGozoId ?? null,
      abertaPor: input.abertaPor,
      createdAt: now,
      updatedAt: now,
    }
    this.items.set(folha._id.toHexString(), folha)
    return folha
  }

  async findById(id: string | ObjectId): Promise<Folha | null> {
    const key = typeof id === 'string' ? id : id.toHexString()
    return this.items.get(key) ?? null
  }

  async findByCodigo(codigo: string): Promise<Folha | null> {
    for (const f of this.items.values()) if (f.codigo === codigo) return f
    return null
  }

  async findByFuncionarioCompetencia(
    codigoFun: string,
    tipo: TipoFolha,
    competencia: string,
  ): Promise<Folha | null> {
    for (const f of this.items.values()) {
      if (f.codigoFun === codigoFun && f.tipo === tipo && f.competencia === competencia) return f
    }
    return null
  }

  async list(filter: ListFolhasFilter, page: number, limit: number): Promise<ListFolhasPage> {
    let result = Array.from(this.items.values())
    if (filter.status) result = result.filter((f) => f.status === filter.status)
    if (filter.tipo) result = result.filter((f) => f.tipo === filter.tipo)
    if (filter.funcionarioId)
      result = result.filter((f) => f.funcionarioId === filter.funcionarioId)
    if (filter.codigoFun) result = result.filter((f) => f.codigoFun === filter.codigoFun)
    if (filter.competencia) result = result.filter((f) => f.competencia === filter.competencia)
    result.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    const total = result.length
    const start = (page - 1) * limit
    const items = result.slice(start, start + limit)
    return { items, total, page, limit, pages: Math.max(1, Math.ceil(total / limit)) }
  }

  async setProventosDescontos(
    id: string | ObjectId,
    statusEsperado: StatusFolha,
    proventos: readonly ItemFolha[],
    descontos: readonly ItemFolha[],
  ): Promise<boolean> {
    const key = typeof id === 'string' ? id : id.toHexString()
    const folha = this.items.get(key)
    if (!folha || folha.status !== statusEsperado) return false
    this.items.set(key, {
      ...folha,
      proventos: [...proventos],
      descontos: [...descontos],
      updatedAt: new Date(),
    })
    return true
  }

  async processar(id: string | ObjectId, input: AtualizarCalculoInput): Promise<boolean> {
    const key = typeof id === 'string' ? id : id.toHexString()
    const folha = this.items.get(key)
    if (!folha || (folha.status !== 'ABERTA' && folha.status !== 'PROCESSADA')) return false
    this.items.set(key, {
      ...folha,
      proventos: [...input.proventos],
      descontos: [...input.descontos],
      totalProventos: input.totalProventos,
      totalDescontos: input.totalDescontos,
      salarioLiquido: input.salarioLiquido,
      descontoINSS: input.descontoINSS,
      descontoIRRF: input.descontoIRRF,
      fgts: input.fgts,
      status: 'PROCESSADA',
      processadaPor: input.processadaPor,
      processadaEm: new Date(),
      justificativaRejeicao: null,
      updatedAt: new Date(),
    })
    return true
  }

  async aprovar(id: string | ObjectId, aprovadaPor: string): Promise<boolean> {
    return this.transicaoSimples(id, 'PROCESSADA', 'APROVADA', { aprovadaPor })
  }

  async rejeitar(
    id: string | ObjectId,
    rejeitadaPor: string,
    justificativa: string,
  ): Promise<boolean> {
    return this.transicaoSimples(id, 'PROCESSADA', 'REJEITADA', {
      aprovadaPor: rejeitadaPor,
      justificativaRejeicao: justificativa,
    })
  }

  async reabrir(id: string | ObjectId): Promise<boolean> {
    return this.transicaoSimples(id, 'REJEITADA', 'ABERTA', {})
  }

  async confirmarPagamento(id: string | ObjectId, pagaPor: string): Promise<boolean> {
    return this.transicaoSimples(id, 'APROVADA', 'PAGA', { pagaPor })
  }

  async fechar(id: string | ObjectId, fechadaPor: string): Promise<boolean> {
    return this.transicaoSimples(id, 'PAGA', 'FECHADA', { fechadaPor })
  }

  private async transicaoSimples(
    id: string | ObjectId,
    de: StatusFolha,
    para: StatusFolha,
    patch: Partial<Folha>,
  ): Promise<boolean> {
    const key = typeof id === 'string' ? id : id.toHexString()
    const folha = this.items.get(key)
    if (!folha || folha.status !== de) return false
    const now = new Date()
    const stamps: { aprovadaEm?: Date; pagaEm?: Date; fechadaEm?: Date } = {}
    if (para === 'APROVADA' || para === 'REJEITADA') stamps.aprovadaEm = now
    if (para === 'PAGA') stamps.pagaEm = now
    if (para === 'FECHADA') stamps.fechadaEm = now
    this.items.set(key, { ...folha, ...patch, ...stamps, status: para, updatedAt: now })
    return true
  }
}
