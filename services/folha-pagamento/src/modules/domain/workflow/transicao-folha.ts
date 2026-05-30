import { TransicaoFolhaInvalidaError } from '../errors/domain-error.js'
import type { StatusFolha } from '../value-objects/status-folha.js'

/**
 * Máquina de estado da folha. Cada chave lista os destinos válidos a partir
 * do estado-fonte.
 *
 *   ABERTA      → PROCESSADA
 *   PROCESSADA  → APROVADA, REJEITADA
 *   APROVADA    → PAGA
 *   PAGA        → FECHADA
 *   FECHADA     → terminal
 *   REJEITADA   → ABERTA (reprocessamento)
 */
const TRANSICOES: Readonly<Record<StatusFolha, readonly StatusFolha[]>> = {
  ABERTA: ['PROCESSADA'],
  PROCESSADA: ['APROVADA', 'REJEITADA'],
  APROVADA: ['PAGA'],
  PAGA: ['FECHADA'],
  FECHADA: [],
  REJEITADA: ['ABERTA'],
}

export function podeTransitarFolha(from: StatusFolha, to: StatusFolha): boolean {
  if (from === to) return false
  return TRANSICOES[from].includes(to)
}

export function validarTransicaoFolha(from: StatusFolha, to: StatusFolha): void {
  if (!podeTransitarFolha(from, to)) {
    throw new TransicaoFolhaInvalidaError(from, to)
  }
}
