import { ObjectId } from 'mongodb'

import type { Auditoria, CreateAuditoriaInput } from '../src/modules/domain/entities/auditoria.js'
import type { AvaliacaoDocument } from '../src/modules/domain/entities/avaliacao.js'
import type { AvaliadorDocument } from '../src/modules/domain/entities/avaliador.js'
import type { FuncionarioCacheDocument } from '../src/modules/domain/entities/funcionario-cache.js'
import type {
  CreateAvaliacaoInput,
  ListarAvaliacoesFiltros,
  ListarAvaliacoesResult,
  UpdateAvaliacaoInput,
} from '../src/modules/repositories/avaliacao.repository.js'
import type { CreateAvaliadorInput } from '../src/modules/repositories/avaliador.repository.js'
import type { UpsertFuncionarioCacheInput } from '../src/modules/repositories/funcionario-cache.repository.js'

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

  async listPorRecurso(recurso: string, recursoId: string): Promise<Auditoria[]> {
    return this.docs.filter((d) => d.recurso === recurso && d.recursoId === recursoId)
  }
}

export class FakeAvaliadorRepository {
  readonly docs = new Map<string, AvaliadorDocument>()

  async findById(id: string): Promise<AvaliadorDocument | null> {
    return this.docs.get(id) ?? null
  }

  async findByUsuarioId(usuarioId: string): Promise<AvaliadorDocument | null> {
    for (const doc of this.docs.values()) {
      if (doc.usuarioId === usuarioId) return doc
    }
    return null
  }

  async list(filtros: { setor?: string; ativo?: boolean }): Promise<AvaliadorDocument[]> {
    return [...this.docs.values()].filter((d) => {
      if (filtros.setor !== undefined && d.setor !== filtros.setor) return false
      if (filtros.ativo !== undefined && d.ativo !== filtros.ativo) return false
      return true
    })
  }

  async create(input: CreateAvaliadorInput): Promise<AvaliadorDocument> {
    const now = new Date()
    const doc: AvaliadorDocument = {
      _id: new ObjectId(),
      usuarioId: input.usuarioId,
      nome: input.nome,
      email: input.email,
      setor: input.setor,
      ativo: true,
      criadoPor: input.criadoPor,
      createdAt: now,
      updatedAt: now,
    }
    this.docs.set(doc._id.toHexString(), doc)
    return doc
  }

  async desativar(id: string): Promise<AvaliadorDocument | null> {
    const existing = this.docs.get(id)
    if (!existing) return null
    const updated: AvaliadorDocument = { ...existing, ativo: false, updatedAt: new Date() }
    this.docs.set(id, updated)
    return updated
  }
}

export class FakeAvaliacaoRepository {
  readonly docs = new Map<string, AvaliacaoDocument>()

  async findById(id: string): Promise<AvaliacaoDocument | null> {
    return this.docs.get(id) ?? null
  }

  async findByCodigo(codigo: string): Promise<AvaliacaoDocument | null> {
    for (const doc of this.docs.values()) {
      if (doc.codigo === codigo) return doc
    }
    return null
  }

  async listar(
    filtros: ListarAvaliacoesFiltros,
    page: number,
    limit: number,
  ): Promise<ListarAvaliacoesResult> {
    let items = [...this.docs.values()]
    if (filtros.codigoFun !== undefined)
      items = items.filter((d) => d.codigoFun === filtros.codigoFun)
    if (filtros.avaliadorId !== undefined)
      items = items.filter((d) => d.avaliadorId === filtros.avaliadorId)
    if (filtros.setor !== undefined) items = items.filter((d) => d.setor === filtros.setor)

    const total = items.length
    const pages = Math.max(1, Math.ceil(total / limit))
    const start = (page - 1) * limit
    const page_items = items
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(start, start + limit)
    return { items: page_items, total, page, limit, pages }
  }

  async create(input: CreateAvaliacaoInput): Promise<AvaliacaoDocument> {
    const now = new Date()
    const doc: AvaliacaoDocument = {
      _id: new ObjectId(),
      codigo: input.codigo,
      codigoFun: input.codigoFun,
      funcionarioId: input.funcionarioId,
      avaliadorId: input.avaliadorId,
      setor: input.setor,
      titulo: input.titulo,
      comentario: input.comentario,
      nota: input.nota,
      createdAt: now,
      updatedAt: now,
    }
    this.docs.set(doc._id.toHexString(), doc)
    return doc
  }

  async update(id: string, input: UpdateAvaliacaoInput): Promise<AvaliacaoDocument | null> {
    const existing = this.docs.get(id)
    if (!existing) return null
    const updated: AvaliacaoDocument = {
      ...existing,
      ...(input.titulo !== undefined ? { titulo: input.titulo } : {}),
      ...(input.comentario !== undefined ? { comentario: input.comentario } : {}),
      ...(input.nota !== undefined ? { nota: input.nota } : {}),
      updatedAt: new Date(),
    }
    this.docs.set(id, updated)
    return updated
  }
}

export class FakeFuncionarioCacheRepository {
  readonly docs = new Map<string, FuncionarioCacheDocument>()

  async findById(funcionarioId: string): Promise<FuncionarioCacheDocument | null> {
    return this.docs.get(funcionarioId) ?? null
  }

  async findByCodigoFun(codigoFun: string): Promise<FuncionarioCacheDocument | null> {
    for (const doc of this.docs.values()) {
      if (doc.codigoFun === codigoFun) return doc
    }
    return null
  }

  async upsert(input: UpsertFuncionarioCacheInput): Promise<FuncionarioCacheDocument> {
    const doc: FuncionarioCacheDocument = { ...input, updatedAt: new Date() }
    this.docs.set(input._id, doc)
    return doc
  }

  async marcarInativo(funcionarioId: string): Promise<void> {
    const existing = this.docs.get(funcionarioId)
    if (existing) {
      this.docs.set(funcionarioId, { ...existing, ativo: false, updatedAt: new Date() })
    }
  }
}

export class FakeContadorRepository {
  private readonly counters = new Map<string, number>()

  async proximoValor(id: string): Promise<number> {
    const current = this.counters.get(id) ?? 0
    const next = current + 1
    this.counters.set(id, next)
    return next
  }
}
