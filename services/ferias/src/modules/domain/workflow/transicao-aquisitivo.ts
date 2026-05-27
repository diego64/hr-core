import type { PeriodoAquisitivoStatus } from '../entities/periodo-aquisitivo.js'
import { TransicaoInvalidaError } from '../errors/domain-error.js'

/**
 * Workflow do período aquisitivo (CLT):
 *   EM_CURSO   → DISPONIVEL | VENCIDO
 *   DISPONIVEL → EM_GOZO | ENCERRADO | VENCIDO
 *   EM_GOZO    → ENCERRADO | DISPONIVEL (quando 1 gozo conclui mas resta saldo)
 *   ENCERRADO  → terminal
 *   VENCIDO    → terminal (infração trabalhista, exige ação de RH)
 */
const TRANSICOES: Readonly<Record<PeriodoAquisitivoStatus, readonly PeriodoAquisitivoStatus[]>> = {
  EM_CURSO: ['DISPONIVEL', 'VENCIDO'],
  DISPONIVEL: ['EM_GOZO', 'ENCERRADO', 'VENCIDO'],
  EM_GOZO: ['DISPONIVEL', 'ENCERRADO'],
  ENCERRADO: [],
  VENCIDO: [],
}

export function podeTransitarAquisitivo(
  from: PeriodoAquisitivoStatus,
  to: PeriodoAquisitivoStatus,
): boolean {
  if (from === to) return false
  return TRANSICOES[from].includes(to)
}

export function validarTransicaoAquisitivo(
  from: PeriodoAquisitivoStatus,
  to: PeriodoAquisitivoStatus,
): void {
  if (!podeTransitarAquisitivo(from, to)) {
    throw new TransicaoInvalidaError(from, to)
  }
}
