import { type Db, type Collection, ObjectId } from 'mongodb'

import type {
  CreateFuncionarioInput,
  Funcionario,
  FuncionarioStatus,
} from '../domain/entities/funcionario.js'

export interface ListFuncionariosFilter {
  readonly status?: FuncionarioStatus
  readonly departamento?: string
}

export interface ListFuncionariosPage {
  readonly items: Funcionario[]
  readonly total: number
  readonly page: number
  readonly limit: number
  readonly pages: number
}

export interface AtualizarValidacaoInput {
  readonly score: number
  readonly asoValido: boolean
  readonly ctpsDigital: boolean
}

export class FuncionarioRepository {
  private readonly collection: Collection<Funcionario>

  constructor(db: Db) {
    this.collection = db.collection<Funcionario>('funcionarios')
  }

  async create(input: CreateFuncionarioInput): Promise<Funcionario> {
    const now = new Date()
    const document = {
      _id: new ObjectId(),
      codigoFun: input.codigoFun,
      codigoHR: input.codigoHR,
      nome: input.nome.trim(),
      cpf: input.cpf,
      email: input.email.toLowerCase(),
      telefone: input.telefone.trim(),
      cargo: input.cargo.trim(),
      departamento: input.departamento.trim(),
      gestorId: input.gestorId ?? null,
      status: input.status ?? 'PENDENTE',
      score: input.score ?? 0,
      asoValido: input.asoValido ?? false,
      ctpsDigital: input.ctpsDigital ?? false,
      createdAt: now,
      updatedAt: now,
    } satisfies Funcionario

    await this.collection.insertOne(document)
    return document
  }

  async findById(id: string | ObjectId): Promise<Funcionario | null> {
    const objectId = typeof id === 'string' ? new ObjectId(id) : id
    return this.collection.findOne({ _id: objectId })
  }

  async findByCodigoFun(codigoFun: string): Promise<Funcionario | null> {
    return this.collection.findOne({ codigoFun })
  }

  async findByCpf(cpf: string): Promise<Funcionario | null> {
    return this.collection.findOne({ cpf })
  }

  async findByEmail(email: string): Promise<Funcionario | null> {
    return this.collection.findOne({ email: email.toLowerCase() })
  }

  async list(
    filter: ListFuncionariosFilter,
    page: number,
    limit: number,
  ): Promise<ListFuncionariosPage> {
    const query: Record<string, unknown> = {}
    if (filter.status) query.status = filter.status
    if (filter.departamento) query.departamento = filter.departamento

    const skip = (page - 1) * limit
    const [items, total] = await Promise.all([
      this.collection.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit).toArray(),
      this.collection.countDocuments(query),
    ])

    return {
      items,
      total,
      page,
      limit,
      pages: Math.max(1, Math.ceil(total / limit)),
    }
  }

  /**
   * Atualiza o snapshot de validação eSocial (score + flags). Idempotente.
   * Usado pelo score engine após cada aprovação/rejeição de documento.
   */
  async atualizarValidacao(
    id: string | ObjectId,
    input: AtualizarValidacaoInput,
  ): Promise<boolean> {
    const objectId = typeof id === 'string' ? new ObjectId(id) : id
    const result = await this.collection.updateOne(
      { _id: objectId },
      {
        $set: {
          score: input.score,
          asoValido: input.asoValido,
          ctpsDigital: input.ctpsDigital,
          updatedAt: new Date(),
        },
      },
    )
    return result.matchedCount === 1
  }

  /**
   * Atualiza o status. NÃO valida a transição — quem chama deve ter chamado
   * `validarTransicao(from, to)` antes. O filtro `status: from` previne race
   * condition (outro request mudou o status entre a leitura e o update).
   */
  async atualizarStatus(
    id: string | ObjectId,
    from: FuncionarioStatus,
    to: FuncionarioStatus,
  ): Promise<boolean> {
    const objectId = typeof id === 'string' ? new ObjectId(id) : id
    const result = await this.collection.updateOne(
      { _id: objectId, status: from },
      { $set: { status: to, updatedAt: new Date() } },
    )
    return result.modifiedCount === 1
  }

  /**
   * Aplica um conjunto parcial de alterações cadastrais (telefone, cargo,
   * departamento, gestorId). Usado pelo fluxo de aprovação cadastral
   * (Aprovacao APROVADA → aplica payload).
   *
   * Aceita apenas as chaves listadas; o caller deve construir um objeto
   * já filtrado (o tipo CamposEditaveis garante isso em tempo de compilação).
   * Strings são trim-adas para manter consistência com `create()`.
   */
  async atualizarCampos(
    id: string | ObjectId,
    campos: {
      telefone?: string | undefined
      cargo?: string | undefined
      departamento?: string | undefined
      gestorId?: string | null | undefined
    },
  ): Promise<boolean> {
    const objectId = typeof id === 'string' ? new ObjectId(id) : id
    const $set: Record<string, unknown> = { updatedAt: new Date() }
    if (campos.telefone !== undefined) $set.telefone = campos.telefone.trim()
    if (campos.cargo !== undefined) $set.cargo = campos.cargo.trim()
    if (campos.departamento !== undefined) $set.departamento = campos.departamento.trim()
    if (campos.gestorId !== undefined) $set.gestorId = campos.gestorId

    const result = await this.collection.updateOne({ _id: objectId }, { $set })
    return result.matchedCount === 1
  }

  /**
   * Marca como DESLIGADO (soft delete). Retorna true se afetou algum
   * documento, false se o registro não existia ou já estava DESLIGADO.
   */
  async desligar(id: string | ObjectId): Promise<boolean> {
    const objectId = typeof id === 'string' ? new ObjectId(id) : id
    const result = await this.collection.updateOne(
      { _id: objectId, status: { $ne: 'DESLIGADO' } },
      { $set: { status: 'DESLIGADO', updatedAt: new Date() } },
    )
    return result.modifiedCount === 1
  }
}
