import { ObjectId } from 'mongodb'

import type {
  PeriodoAquisitivo,
  PeriodoAquisitivoStatus,
} from '../src/modules/domain/entities/periodo-aquisitivo.js'
import type { PeriodoGozo, PeriodoGozoStatus } from '../src/modules/domain/entities/periodo-gozo.js'
import type {
  SolicitacaoFerias,
  SolicitacaoStatus,
} from '../src/modules/domain/entities/solicitacao-ferias.js'

/**
 * Builders pra testes. Reduzem boilerplate sem esconder o que importa pro
 * caso de teste — overrides ficam óbvios.
 */

const FUNCIONARIO_ID_DEFAULT = '00000000-0000-0000-0000-000000000abc'
const CODIGO_FUN_DEFAULT = 'FUN12345678900'

export function makePeriodoAquisitivo(
  overrides: Partial<PeriodoAquisitivo> = {},
): PeriodoAquisitivo {
  const dataInicio = overrides.dataInicio ?? new Date('2024-01-01T00:00:00Z')
  const dataFim = overrides.dataFim ?? new Date('2024-12-31T23:59:59Z')
  const dataLimiteGozo = overrides.dataLimiteGozo ?? new Date('2025-12-31T23:59:59Z')
  const diasDevidos = overrides.diasDevidos ?? 30
  const diasGozados = overrides.diasGozados ?? 0
  const diasVendidos = overrides.diasVendidos ?? 0
  const saldoDias = overrides.saldoDias ?? diasDevidos - diasGozados - diasVendidos
  const status: PeriodoAquisitivoStatus = overrides.status ?? 'DISPONIVEL'
  const now = new Date()
  return {
    _id: overrides._id ?? new ObjectId(),
    funcionarioId: overrides.funcionarioId ?? FUNCIONARIO_ID_DEFAULT,
    codigoFun: overrides.codigoFun ?? CODIGO_FUN_DEFAULT,
    dataInicio,
    dataFim,
    dataLimiteGozo,
    diasDevidos,
    diasGozados,
    diasVendidos,
    saldoDias,
    status,
    createdAt: overrides.createdAt ?? now,
    updatedAt: overrides.updatedAt ?? now,
  }
}

export function makeSolicitacao(overrides: Partial<SolicitacaoFerias> = {}): SolicitacaoFerias {
  const now = new Date()
  const status: SolicitacaoStatus = overrides.status ?? 'PENDENTE'
  return {
    _id: overrides._id ?? new ObjectId(),
    codigo: overrides.codigo ?? 'FER000001',
    codigoFun: overrides.codigoFun ?? CODIGO_FUN_DEFAULT,
    funcionarioId: overrides.funcionarioId ?? FUNCIONARIO_ID_DEFAULT,
    periodoAquisitivoId: overrides.periodoAquisitivoId ?? new ObjectId(),
    periodoGozoId: overrides.periodoGozoId ?? null,
    dataInicio: overrides.dataInicio ?? new Date('2026-07-01T00:00:00Z'),
    dataFim: overrides.dataFim ?? new Date('2026-07-14T23:59:59Z'),
    diasSolicitados: overrides.diasSolicitados ?? 14,
    abonoPecuniario: overrides.abonoPecuniario ?? false,
    diasAbono: overrides.diasAbono ?? 0,
    status,
    justificativaRejeicao: overrides.justificativaRejeicao ?? null,
    motivoCancelamento: overrides.motivoCancelamento ?? null,
    aprovadoPor: overrides.aprovadoPor ?? null,
    aprovadoEm: overrides.aprovadoEm ?? null,
    canceladoPor: overrides.canceladoPor ?? null,
    canceladoEm: overrides.canceladoEm ?? null,
    solicitadoPor: overrides.solicitadoPor ?? 'usuario-1',
    createdAt: overrides.createdAt ?? now,
    updatedAt: overrides.updatedAt ?? now,
  }
}

export function makePeriodoGozo(overrides: Partial<PeriodoGozo> = {}): PeriodoGozo {
  const now = new Date()
  const status: PeriodoGozoStatus = overrides.status ?? 'AGENDADO'
  return {
    _id: overrides._id ?? new ObjectId(),
    funcionarioId: overrides.funcionarioId ?? FUNCIONARIO_ID_DEFAULT,
    codigoFun: overrides.codigoFun ?? CODIGO_FUN_DEFAULT,
    periodoAquisitivoId: overrides.periodoAquisitivoId ?? new ObjectId(),
    solicitacaoId: overrides.solicitacaoId ?? new ObjectId(),
    dataInicio: overrides.dataInicio ?? new Date('2026-07-01T00:00:00Z'),
    dataFim: overrides.dataFim ?? new Date('2026-07-14T23:59:59Z'),
    diasGozo: overrides.diasGozo ?? 14,
    diasAbono: overrides.diasAbono ?? 0,
    salarioBruto: overrides.salarioBruto ?? 4000,
    valorFerias: overrides.valorFerias ?? 1866.67,
    valorTerco: overrides.valorTerco ?? 622.22,
    valorAbono: overrides.valorAbono ?? 0,
    valorTotal: overrides.valorTotal ?? 2488.89,
    dataPagamento: overrides.dataPagamento ?? null,
    status,
    createdAt: overrides.createdAt ?? now,
    updatedAt: overrides.updatedAt ?? now,
  }
}

export { FUNCIONARIO_ID_DEFAULT, CODIGO_FUN_DEFAULT }
