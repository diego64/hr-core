import { ObjectId } from 'mongodb'

import type { Folha, ItemFolha } from '../src/modules/domain/entities/folha.js'
import type { FuncionarioCache } from '../src/modules/domain/entities/funcionario-cache.js'
import type { StatusFolha } from '../src/modules/domain/value-objects/status-folha.js'
import type { TipoFolha } from '../src/modules/domain/value-objects/tipo-folha.js'

/**
 * Builders pra testes. Reduzem boilerplate sem esconder o que importa pro
 * caso de teste — overrides ficam óbvios.
 */

const FUNCIONARIO_ID_DEFAULT = '00000000-0000-0000-0000-000000000abc'
const CODIGO_FUN_DEFAULT = 'FUN12345678900'

export function makeFuncionarioCache(overrides: Partial<FuncionarioCache> = {}): FuncionarioCache {
  const now = new Date()
  return {
    _id: overrides._id ?? FUNCIONARIO_ID_DEFAULT,
    codigoFun: overrides.codigoFun ?? CODIGO_FUN_DEFAULT,
    nome: overrides.nome ?? 'João da Silva',
    setor: overrides.setor ?? 'Tecnologia',
    salarioBase: overrides.salarioBase ?? 5000,
    numeroDependentes: overrides.numeroDependentes ?? 0,
    ativo: overrides.ativo ?? true,
    updatedAt: overrides.updatedAt ?? now,
  }
}

export function makeFolha(overrides: Partial<Folha> = {}): Folha {
  const now = new Date()
  const status: StatusFolha = overrides.status ?? 'ABERTA'
  const tipo: TipoFolha = overrides.tipo ?? 'MENSAL'
  return {
    _id: overrides._id ?? new ObjectId(),
    codigo: overrides.codigo ?? 'FOLHA000001',
    codigoFun: overrides.codigoFun ?? CODIGO_FUN_DEFAULT,
    funcionarioId: overrides.funcionarioId ?? FUNCIONARIO_ID_DEFAULT,
    tipo,
    competencia: overrides.competencia ?? '2026-05',
    salarioBase: overrides.salarioBase ?? 5000,
    numeroDependentes: overrides.numeroDependentes ?? 0,
    proventos: overrides.proventos ?? [],
    descontos: overrides.descontos ?? [],
    totalProventos: overrides.totalProventos ?? 0,
    totalDescontos: overrides.totalDescontos ?? 0,
    salarioLiquido: overrides.salarioLiquido ?? 0,
    fgts: overrides.fgts ?? 0,
    descontoINSS: overrides.descontoINSS ?? 0,
    descontoIRRF: overrides.descontoIRRF ?? 0,
    status,
    processadaPor: overrides.processadaPor ?? null,
    processadaEm: overrides.processadaEm ?? null,
    aprovadaPor: overrides.aprovadaPor ?? null,
    aprovadaEm: overrides.aprovadaEm ?? null,
    justificativaRejeicao: overrides.justificativaRejeicao ?? null,
    pagaPor: overrides.pagaPor ?? null,
    pagaEm: overrides.pagaEm ?? null,
    fechadaPor: overrides.fechadaPor ?? null,
    fechadaEm: overrides.fechadaEm ?? null,
    periodoGozoId: overrides.periodoGozoId ?? null,
    abertaPor: overrides.abertaPor ?? 'coord-1',
    createdAt: overrides.createdAt ?? now,
    updatedAt: overrides.updatedAt ?? now,
  }
}

export function makeItemFolha(overrides: Partial<ItemFolha> = {}): ItemFolha {
  return {
    codigo: overrides.codigo ?? '002',
    descricao: overrides.descricao ?? 'Hora extra 50%',
    tipo: overrides.tipo ?? 'PROVENTO',
    valor: overrides.valor ?? 100,
    ...(overrides.referencia !== undefined ? { referencia: overrides.referencia } : {}),
  }
}

export { FUNCIONARIO_ID_DEFAULT, CODIGO_FUN_DEFAULT }
