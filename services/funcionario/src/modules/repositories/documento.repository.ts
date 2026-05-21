import { type Db, type Collection, ObjectId } from 'mongodb'

import type {
  CreateDocumentoInput,
  Documento,
  DocumentoStatus,
} from '../domain/entities/documento.js'

export class DocumentoRepository {
  private readonly collection: Collection<Documento>

  constructor(db: Db) {
    this.collection = db.collection<Documento>('documentos')
  }

  async create(input: CreateDocumentoInput): Promise<Documento> {
    const now = new Date()
    const document = {
      _id: new ObjectId(),
      funcionarioId: input.funcionarioId,
      tipo: input.tipo,
      status: 'PENDENTE' as DocumentoStatus,
      storageKey: input.storageKey,
      nomeOriginal: input.nomeOriginal,
      mimeType: input.mimeType,
      tamanhoBytes: input.tamanhoBytes,
      enviadoPor: input.enviadoPor,
      enviadoEm: now,
      aprovadoPor: null,
      aprovadoEm: null,
      motivoRejeicao: null,
      updatedAt: now,
    } satisfies Documento

    await this.collection.insertOne(document)
    return document
  }

  async findById(id: string | ObjectId): Promise<Documento | null> {
    const objectId = typeof id === 'string' ? new ObjectId(id) : id
    return this.collection.findOne({ _id: objectId })
  }

  /**
   * Lista todos os documentos do funcionário, mais recentes primeiro.
   * Inclui histórico (PENDENTE/APROVADO/REJEITADO) — quem consome decide
   * o que filtrar.
   */
  async listByFuncionario(funcionarioId: string | ObjectId): Promise<Documento[]> {
    const fId = typeof funcionarioId === 'string' ? new ObjectId(funcionarioId) : funcionarioId
    return this.collection.find({ funcionarioId: fId }).sort({ enviadoEm: -1 }).toArray()
  }

  /**
   * Conjunto de documentos APROVADOS mais recentes de cada tipo para um
   * funcionário. Usado pelo score engine — múltiplos APROVADOS do mesmo
   * tipo (re-uploads) contam apenas o último. PENDENTE e REJEITADO não
   * entram.
   */
  async listarAprovadosPorTipo(funcionarioId: string | ObjectId): Promise<Documento[]> {
    const fId = typeof funcionarioId === 'string' ? new ObjectId(funcionarioId) : funcionarioId
    const pipeline = [
      { $match: { funcionarioId: fId, status: 'APROVADO' } },
      { $sort: { aprovadoEm: -1 as const } },
      {
        $group: {
          _id: '$tipo',
          doc: { $first: '$$ROOT' },
        },
      },
      { $replaceRoot: { newRoot: '$doc' } },
    ]
    return this.collection.aggregate<Documento>(pipeline).toArray()
  }

  /**
   * Lista todos os documentos PENDENTES de um funcionário. Ordenado por
   * enviadoEm (mais antigo primeiro) para o bulk-approve processar na
   * ordem em que chegaram.
   */
  async listarPendentesDoFuncionario(funcionarioId: string | ObjectId): Promise<Documento[]> {
    const fId = typeof funcionarioId === 'string' ? new ObjectId(funcionarioId) : funcionarioId
    return this.collection
      .find({ funcionarioId: fId, status: 'PENDENTE' })
      .sort({ enviadoEm: 1 })
      .toArray()
  }

  async aprovar(id: string | ObjectId, aprovadoPor: string): Promise<boolean> {
    const objectId = typeof id === 'string' ? new ObjectId(id) : id
    const now = new Date()
    const result = await this.collection.updateOne(
      { _id: objectId, status: 'PENDENTE' },
      {
        $set: {
          status: 'APROVADO',
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
          status: 'REJEITADO',
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
