import type { PeriodoGozoStatus } from '../entities/periodo-gozo.js'
import { TransicaoInvalidaError } from '../errors/domain-error.js'

/**
 * Workflow do período de gozo:
 *   AGENDADO → EM_GOZO | CANCELADO
 *   EM_GOZO  → CONCLUIDO
 *   CONCLUIDO → terminal
 *   CANCELADO → terminal
 */
const TRANSICOES: Readonly<Record<PeriodoGozoStatus, readonly PeriodoGozoStatus[]>> = {
  AGENDADO: ['EM_GOZO', 'CANCELADO'],
  EM_GOZO: ['CONCLUIDO'],
  CONCLUIDO: [],
  CANCELADO: [],
}

export function podeTransitarGozo(from: PeriodoGozoStatus, to: PeriodoGozoStatus): boolean {
  if (from === to) return false
  return TRANSICOES[from].includes(to)
}

export function validarTransicaoGozo(from: PeriodoGozoStatus, to: PeriodoGozoStatus): void {
  if (!podeTransitarGozo(from, to)) {
    throw new TransicaoInvalidaError(from, to)
  }
}
