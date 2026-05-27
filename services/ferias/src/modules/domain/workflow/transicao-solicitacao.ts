import type { SolicitacaoStatus } from '../entities/solicitacao-ferias.js'
import { TransicaoInvalidaError } from '../errors/domain-error.js'

/**
 * Workflow da solicitação:
 *   PENDENTE → APROVADA | REJEITADA | CANCELADA
 *   APROVADA → CANCELADA (apenas ADMINISTRADOR — antes de iniciar gozo)
 *   REJEITADA → terminal
 *   CANCELADA → terminal
 */
const TRANSICOES: Readonly<Record<SolicitacaoStatus, readonly SolicitacaoStatus[]>> = {
  PENDENTE: ['APROVADA', 'REJEITADA', 'CANCELADA'],
  APROVADA: ['CANCELADA'],
  REJEITADA: [],
  CANCELADA: [],
}

export function podeTransitarSolicitacao(from: SolicitacaoStatus, to: SolicitacaoStatus): boolean {
  if (from === to) return false
  return TRANSICOES[from].includes(to)
}

export function validarTransicaoSolicitacao(from: SolicitacaoStatus, to: SolicitacaoStatus): void {
  if (!podeTransitarSolicitacao(from, to)) {
    throw new TransicaoInvalidaError(from, to)
  }
}
