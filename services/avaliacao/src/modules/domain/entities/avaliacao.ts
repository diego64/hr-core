import type { ObjectId } from 'mongodb'

import type { NotaValor } from '../value-objects/nota.js'

export interface AvaliacaoDocument {
  readonly _id: ObjectId
  readonly codigo: string
  readonly codigoFun: string
  readonly funcionarioId: string
  readonly avaliadorId: string
  readonly setor: string
  readonly titulo: string
  readonly comentario: string
  readonly nota: NotaValor
  readonly createdAt: Date
  readonly updatedAt: Date
}

export interface AvaliacaoPublic {
  readonly id: string
  readonly codigo: string
  readonly codigoFun: string
  readonly funcionarioId: string
  readonly avaliadorId: string
  readonly setor: string
  readonly titulo: string
  readonly comentario: string
  readonly nota: NotaValor
  readonly createdAt: string
  readonly updatedAt: string
}

export function toAvaliacaoPublic(doc: AvaliacaoDocument): AvaliacaoPublic {
  return {
    id: doc._id.toHexString(),
    codigo: doc.codigo,
    codigoFun: doc.codigoFun,
    funcionarioId: doc.funcionarioId,
    avaliadorId: doc.avaliadorId,
    setor: doc.setor,
    titulo: doc.titulo,
    comentario: doc.comentario,
    nota: doc.nota,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  }
}
