import { TransicaoInvalidaError } from '../errors/domain-error.js'
import type { FuncionarioStatus } from '../entities/funcionario.js'

/**
 * Tabela de transições permitidas. Cada chave é o estado atual;
 * o array é o conjunto de destinos válidos.
 *
 *   PENDENTE ──► EM_VALIDACAO ──► APROVADO ──► ATIVO
 *      │              │              │           │
 *      └─► REPROVADO ◄┘              │           ├──► AFASTADO ──► ATIVO
 *                                    │           ├──► INATIVO
 *                                    │           └──► DESLIGADO
 *
 * Regras de bordo:
 *   - REPROVADO e DESLIGADO são terminais.
 *   - APROVADO só promove para ATIVO (canal automático após validação eSocial).
 *   - AFASTADO retorna para ATIVO (retorno do afastamento).
 *   - PENDENTE/EM_VALIDACAO podem ser reprovados a qualquer momento.
 */
const TRANSICOES: Readonly<Record<FuncionarioStatus, readonly FuncionarioStatus[]>> = {
  PENDENTE: ['EM_VALIDACAO', 'REPROVADO'],
  EM_VALIDACAO: ['APROVADO', 'REPROVADO'],
  APROVADO: ['ATIVO'],
  ATIVO: ['AFASTADO', 'INATIVO', 'DESLIGADO'],
  AFASTADO: ['ATIVO', 'DESLIGADO'],
  INATIVO: ['ATIVO', 'DESLIGADO'],
  REPROVADO: [],
  DESLIGADO: [],
}

export function podeTransitar(from: FuncionarioStatus, to: FuncionarioStatus): boolean {
  if (from === to) return false
  return TRANSICOES[from].includes(to)
}

export function validarTransicao(from: FuncionarioStatus, to: FuncionarioStatus): void {
  if (!podeTransitar(from, to)) {
    throw new TransicaoInvalidaError(from, to)
  }
}
