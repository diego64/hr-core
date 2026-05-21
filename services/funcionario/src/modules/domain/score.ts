import type { Documento, TipoDocumento } from './entities/documento.js'

/**
 * Pesos por tipo de documento. Soma exata = 100, então o score vira uma
 * porcentagem direta sem normalização. Atribuímos peso maior ao ASO
 * (validação médica do trabalho) e à CTPS_DIGITAL/COMPROVANTE_ENDERECO
 * (documentos exigidos pelo eSocial para registro válido).
 *
 * Trade-off: pesos fixos no código mantêm o cálculo determinístico e
 * test-friendly. Quando regras de negócio precisarem variar (ex: pesos
 * por departamento), promovemos para configuração — não para um BD —
 * para manter o cálculo idempotente.
 */
export const DOCUMENTO_PESOS: Readonly<Record<TipoDocumento, number>> = {
  RG: 10,
  CPF: 10,
  CTPS_DIGITAL: 20,
  ASO_ADMISSIONAL: 30,
  PIS: 10,
  COMPROVANTE_ENDERECO: 20,
}

export const SCORE_TOTAL = Object.values(DOCUMENTO_PESOS).reduce((sum, w) => sum + w, 0)

export interface ValidacaoESocial {
  readonly score: number
  readonly asoValido: boolean
  readonly ctpsDigital: boolean
}

/**
 * Recalcula o snapshot eSocial a partir do conjunto de documentos APROVADOS
 * (já deduplicados por tipo — quem chama deve passar `listarAprovadosPorTipo`).
 *
 * Aceita documentos com qualquer status como entrada e filtra para
 * APROVADOS — torna a função mais robusta sem custo prático (o caller real
 * já filtra via aggregate).
 */
export function calcularValidacaoESocial(
  documentosAprovadosUnicosPorTipo: readonly Documento[],
): ValidacaoESocial {
  const aprovados = documentosAprovadosUnicosPorTipo.filter((d) => d.status === 'APROVADO')
  const tiposAprovados = new Set<TipoDocumento>(aprovados.map((d) => d.tipo))

  let pesoAprovado = 0
  for (const tipo of tiposAprovados) {
    pesoAprovado += DOCUMENTO_PESOS[tipo]
  }
  const score = Math.round((pesoAprovado / SCORE_TOTAL) * 100)

  return {
    score,
    asoValido: tiposAprovados.has('ASO_ADMISSIONAL'),
    ctpsDigital: tiposAprovados.has('CTPS_DIGITAL'),
  }
}

/**
 * Critério de admissão completa do eSocial (rule 7).
 * Funcionário só pode ser ativado quando: score atinge 100, ASO foi aprovado,
 * CTPS Digital foi aprovada.
 */
export function passouValidacaoESocial(v: ValidacaoESocial): boolean {
  return v.score === 100 && v.asoValido && v.ctpsDigital
}
