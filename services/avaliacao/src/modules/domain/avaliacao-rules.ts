import {
  ComentarioInvalidoError,
  NotaInvalidaError,
  TituloInvalidoError,
} from './errors/domain-error.js'
import { NOTAS_VALIDAS, type NotaValor } from './value-objects/nota.js'

export const TITULO_MIN_CHARS = 5
export const TITULO_MAX_CHARS = 100
export const COMENTARIO_MIN_CHARS = 20
export const COMENTARIO_MAX_CHARS = 2000

/**
 * Valida título: trim, presente, dentro do intervalo de tamanho. Retorna
 * a versão saneada para persistir.
 */
export function validarTitulo(input: unknown): string {
  if (typeof input !== 'string') {
    throw new TituloInvalidoError('Título precisa ser uma string')
  }
  const trimmed = input.trim()
  if (trimmed.length < TITULO_MIN_CHARS) {
    throw new TituloInvalidoError(
      `Título precisa ter no mínimo ${TITULO_MIN_CHARS} caracteres. Recebido: ${trimmed.length}.`,
    )
  }
  if (trimmed.length > TITULO_MAX_CHARS) {
    throw new TituloInvalidoError(
      `Título precisa ter no máximo ${TITULO_MAX_CHARS} caracteres. Recebido: ${trimmed.length}.`,
    )
  }
  return trimmed
}

/**
 * Valida comentário: trim, presente, dentro do intervalo de tamanho. Retorna
 * a versão saneada para persistir.
 */
export function validarComentario(input: unknown): string {
  if (typeof input !== 'string') {
    throw new ComentarioInvalidoError('Comentário precisa ser uma string')
  }
  const trimmed = input.trim()
  if (trimmed.length < COMENTARIO_MIN_CHARS) {
    throw new ComentarioInvalidoError(
      `Comentário precisa ter no mínimo ${COMENTARIO_MIN_CHARS} caracteres. Recebido: ${trimmed.length}.`,
    )
  }
  if (trimmed.length > COMENTARIO_MAX_CHARS) {
    throw new ComentarioInvalidoError(
      `Comentário precisa ter no máximo ${COMENTARIO_MAX_CHARS} caracteres. Recebido: ${trimmed.length}.`,
    )
  }
  return trimmed
}

export function validarNota(input: unknown): NotaValor {
  if (typeof input !== 'number' || !Number.isInteger(input)) {
    throw new NotaInvalidaError(input)
  }
  if (!NOTAS_VALIDAS.includes(input as NotaValor)) {
    throw new NotaInvalidaError(input)
  }
  return input as NotaValor
}
