import { type Collection, type Db, ObjectId } from 'mongodb'

import type {
  Aprovacao,
  AprovacaoStatus,
  CreateAprovacaoInput,
} from '../domain/entities/aprovacao.js'

export interface ListAprovacoesFilter {
  readonly status?: AprovacaoStatus | undefined
  readonly funcionarioId?: string | ObjectId | undefined
}

export class AprovacaoRepository {
  private readonly collection: Collection<Aprovacao>

  constructor(db: Db) {
    this.collection = db.collection<Aprovacao>('aprovacoes')
  }

  async create(input: CreateAprovacaoInput): Promise<Aprovacao> {
    const now = new Date()
    const document = {
      _id: new ObjectId(),
      funcionarioId: input.funcionarioId,
      tipo: input.tipo,
      status: 'PENDENTE' as AprovacaoStatus,
      camposAlterados: input.camposAlterados,
      solicitadoPor: input.solicitadoPor,
      solicitadoEm: now,
      aprovadoPor: null,
      aprovadoEm: null,
      motivoRejeicao: null,
      updatedAt: now,
    } satisfies Aprovacao

    await this.collection.insertOne(document)
    return document
  }

  async findById(id: string | ObjectId): Promise<Aprovacao | null> {
    const objectId = typeof id === 'string' ? new ObjectId(id) : id
    return this.collection.findOne({ _id: objectId })
  }

  async list(filter: ListAprovacoesFilter = {}): Promise<Aprovacao[]> {
    const query: Record<string, unknown> = {}
    if (filter.status) query.status = filter.status
    if (filter.funcionarioId) {
      query.funcionarioId =
        typeof filter.funcionarioId === 'string'
          ? new ObjectId(filter.funcionarioId)
          : filter.funcionarioId
    }
    return this.collection.find(query).sort({ solicitadoEm: -1 }).toArray()
  }

  async aprovar(id: string | ObjectId, aprovadoPor: string): Promise<boolean> {
    const objectId = typeof id === 'string' ? new ObjectId(id) : id
    const now = new Date()
    const result = await this.collection.updateOne(
      { _id: objectId, status: 'PENDENTE' },
      {
        $set: {
          status: 'APROVADA',
          aprovadoPor,
          aprovadoEm: now,
          updatedAt: now,
        },
      },
    )
    return result.modifiedCount === 1
  }

  async rejeitar(id: string | ObjectId, aprovadoPor: string, motivo: string): Promise<boolean> {
    const objectId = typeof id === 'string' ? new ObjectId(id) : id
    const now = new Date()
    const result = await this.collection.updateOne(
      { _id: objectId, status: 'PENDENTE' },
      {
        $set: {
          status: 'REJEITADA',
          aprovadoPor,
          aprovadoEm: now,
          motivoRejeicao: motivo,
          updatedAt: now,
        },
      },
    )
    return result.modifiedCount === 1
  }
}
