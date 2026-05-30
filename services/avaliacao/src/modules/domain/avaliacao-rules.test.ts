import { describe, expect, it } from 'vitest'

import {
  COMENTARIO_MAX_CHARS,
  COMENTARIO_MIN_CHARS,
  TITULO_MAX_CHARS,
  TITULO_MIN_CHARS,
  validarComentario,
  validarNota,
  validarTitulo,
} from './avaliacao-rules.js'
import {
  ComentarioInvalidoError,
  NotaInvalidaError,
  TituloInvalidoError,
} from './errors/domain-error.js'

describe('validarTitulo', () => {
  it('aceita título dentro do intervalo e retorna saneado', () => {
    expect(validarTitulo('  Avaliação Q1  ')).toBe('Avaliação Q1')
  })

  it('rejeita título não-string', () => {
    expect(() => validarTitulo(123)).toThrow(TituloInvalidoError)
    expect(() => validarTitulo(null)).toThrow(TituloInvalidoError)
  })

  it(`rejeita título abaixo de ${TITULO_MIN_CHARS} caracteres`, () => {
    expect(() => validarTitulo('abc')).toThrow(TituloInvalidoError)
  })

  it(`rejeita título acima de ${TITULO_MAX_CHARS} caracteres`, () => {
    expect(() => validarTitulo('a'.repeat(TITULO_MAX_CHARS + 1))).toThrow(TituloInvalidoError)
  })
})

describe('validarComentario', () => {
  it('aceita comentário no intervalo', () => {
    const c = 'Demonstrou ótimas habilidades técnicas e colaboração'
    expect(validarComentario(c)).toBe(c)
  })

  it(`rejeita abaixo de ${COMENTARIO_MIN_CHARS} caracteres`, () => {
    expect(() => validarComentario('curto demais')).toThrow(ComentarioInvalidoError)
  })

  it(`rejeita acima de ${COMENTARIO_MAX_CHARS} caracteres`, () => {
    expect(() => validarComentario('a'.repeat(COMENTARIO_MAX_CHARS + 1))).toThrow(
      ComentarioInvalidoError,
    )
  })

  it('rejeita não-string', () => {
    expect(() => validarComentario(undefined)).toThrow(ComentarioInvalidoError)
  })
})

describe('validarNota', () => {
  it.each([1, 2, 3, 4, 5])('aceita nota %i', (n) => {
    expect(validarNota(n)).toBe(n)
  })

  it.each([0, 6, -1, 1.5, '3', null, undefined, NaN])('rejeita %s', (input) => {
    expect(() => validarNota(input)).toThrow(NotaInvalidaError)
  })
})
