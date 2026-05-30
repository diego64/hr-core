import type { ObjectId } from 'mongodb'

import type { StatusFolha } from '../value-objects/status-folha.js'
import type { TipoFolha } from '../value-objects/tipo-folha.js'

export const TIPOS_ITEM = ['PROVENTO', 'DESCONTO'] as const
export type TipoItem = (typeof TIPOS_ITEM)[number]

export interface ItemFolha {
  readonly codigo: string // "001", "101", etc.
  readonly descricao: string
  readonly tipo: TipoItem
  readonly valor: number
  readonly referencia?: string // ex.: "44h" para horas extras
}

export interface Folha {
  readonly _id: ObjectId
  readonly codigo: string // "FOLHA000001"
  readonly codigoFun: string // "FUN12345678900"
  readonly funcionarioId: string
  readonly tipo: TipoFolha
  readonly competencia: string // "2026-05" para mensal; "2026" para 13º
  readonly salarioBase: number
  readonly numeroDependentes: number
  readonly proventos: readonly ItemFolha[]
  readonly descontos: readonly ItemFolha[]
  readonly totalProventos: number
  readonly totalDescontos: number
  readonly salarioLiquido: number
  readonly fgts: number // encargo patronal — não desconta do funcionário
  readonly descontoINSS: number
  readonly descontoIRRF: number
  readonly status: StatusFolha
  readonly processadaPor: string | null
  readonly processadaEm: Date | null
  readonly aprovadaPor: string | null
  readonly aprovadaEm: Date | null
  readonly justificativaRejeicao: string | null
  readonly pagaPor: string | null
  readonly pagaEm: Date | null
  readonly fechadaPor: string | null
  readonly fechadaEm: Date | null
  readonly periodoGozoId: ObjectId | null // preenchido apenas para tipo FERIAS
  readonly abertaPor: string
  readonly createdAt: Date
  readonly updatedAt: Date
}

export interface CreateFolhaInput {
  readonly codigo: string
  readonly codigoFun: string
  readonly funcionarioId: string
  readonly tipo: TipoFolha
  readonly competencia: string
  readonly salarioBase: number
  readonly numeroDependentes: number
  readonly proventos?: readonly ItemFolha[]
  readonly descontos?: readonly ItemFolha[]
  readonly periodoGozoId?: ObjectId | null
  readonly statusInicial?: StatusFolha // FERIAS já entra PROCESSADA
  readonly abertaPor: string
}

export interface PublicItemFolha {
  readonly codigo: string
  readonly descricao: string
  readonly tipo: TipoItem
  readonly valor: number
  readonly referencia: string | null
}

export interface PublicFolha {
  readonly id: string
  readonly codigo: string
  readonly codigoFun: string
  readonly funcionarioId: string
  readonly tipo: TipoFolha
  readonly competencia: string
  readonly salarioBase: number
  readonly numeroDependentes: number
  readonly proventos: PublicItemFolha[]
  readonly descontos: PublicItemFolha[]
  readonly totalProventos: number
  readonly totalDescontos: number
  readonly salarioLiquido: number
  readonly fgts: number
  readonly descontoINSS: number
  readonly descontoIRRF: number
  readonly status: StatusFolha
  readonly processadaPor: string | null
  readonly processadaEm: string | null
  readonly aprovadaPor: string | null
  readonly aprovadaEm: string | null
  readonly justificativaRejeicao: string | null
  readonly pagaPor: string | null
  readonly pagaEm: string | null
  readonly fechadaPor: string | null
  readonly fechadaEm: string | null
  readonly periodoGozoId: string | null
  readonly abertaPor: string
  readonly createdAt: string
  readonly updatedAt: string
}

function toPublicItem(i: ItemFolha): PublicItemFolha {
  return {
    codigo: i.codigo,
    descricao: i.descricao,
    tipo: i.tipo,
    valor: i.valor,
    referencia: i.referencia ?? null,
  }
}

export function toPublicFolha(f: Folha): PublicFolha {
  return {
    id: f._id.toHexString(),
    codigo: f.codigo,
    codigoFun: f.codigoFun,
    funcionarioId: f.funcionarioId,
    tipo: f.tipo,
    competencia: f.competencia,
    salarioBase: f.salarioBase,
    numeroDependentes: f.numeroDependentes,
    proventos: f.proventos.map(toPublicItem),
    descontos: f.descontos.map(toPublicItem),
    totalProventos: f.totalProventos,
    totalDescontos: f.totalDescontos,
    salarioLiquido: f.salarioLiquido,
    fgts: f.fgts,
    descontoINSS: f.descontoINSS,
    descontoIRRF: f.descontoIRRF,
    status: f.status,
    processadaPor: f.processadaPor,
    processadaEm: f.processadaEm ? f.processadaEm.toISOString() : null,
    aprovadaPor: f.aprovadaPor,
    aprovadaEm: f.aprovadaEm ? f.aprovadaEm.toISOString() : null,
    justificativaRejeicao: f.justificativaRejeicao,
    pagaPor: f.pagaPor,
    pagaEm: f.pagaEm ? f.pagaEm.toISOString() : null,
    fechadaPor: f.fechadaPor,
    fechadaEm: f.fechadaEm ? f.fechadaEm.toISOString() : null,
    periodoGozoId: f.periodoGozoId ? f.periodoGozoId.toHexString() : null,
    abertaPor: f.abertaPor,
    createdAt: f.createdAt.toISOString(),
    updatedAt: f.updatedAt.toISOString(),
  }
}
