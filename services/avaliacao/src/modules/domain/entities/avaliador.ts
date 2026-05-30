import type { ObjectId } from 'mongodb'

/**
 * Avaliador — perfil operacional criado pelo ADMINISTRADOR e vinculado a um
 * setor. Possui conta no auth-service com role AVALIADOR. O vínculo com setor
 * é gerenciado aqui, não no auth.
 */
export interface AvaliadorDocument {
  readonly _id: ObjectId
  readonly usuarioId: string
  readonly nome: string
  readonly email: string
  readonly setor: string
  readonly ativo: boolean
  readonly criadoPor: string
  readonly createdAt: Date
  readonly updatedAt: Date
}

export interface AvaliadorPublic {
  readonly id: string
  readonly usuarioId: string
  readonly nome: string
  readonly email: string
  readonly setor: string
  readonly ativo: boolean
  readonly criadoPor: string
  readonly createdAt: string
  readonly updatedAt: string
}

export function toAvaliadorPublic(doc: AvaliadorDocument): AvaliadorPublic {
  return {
    id: doc._id.toHexString(),
    usuarioId: doc.usuarioId,
    nome: doc.nome,
    email: doc.email,
    setor: doc.setor,
    ativo: doc.ativo,
    criadoPor: doc.criadoPor,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  }
}
