import { describe, expect, it } from 'vitest'

import { TransicaoInvalidaError } from '../errors/domain-error.js'
import { podeTransitarSolicitacao, validarTransicaoSolicitacao } from './transicao-solicitacao.js'
import { podeTransitarAquisitivo, validarTransicaoAquisitivo } from './transicao-aquisitivo.js'
import { podeTransitarGozo, validarTransicaoGozo } from './transicao-gozo.js'

describe('workflow / solicitação', () => {
  it.each([
    ['PENDENTE', 'APROVADA'],
    ['PENDENTE', 'REJEITADA'],
    ['PENDENTE', 'CANCELADA'],
    ['APROVADA', 'CANCELADA'],
  ] as const)('permite %s → %s', (from, to) => {
    expect(podeTransitarSolicitacao(from, to)).toBe(true)
  })

  it('REJEITADA é terminal', () => {
    expect(podeTransitarSolicitacao('REJEITADA', 'APROVADA')).toBe(false)
    expect(podeTransitarSolicitacao('REJEITADA', 'CANCELADA')).toBe(false)
  })

  it('mesma origem → destino sempre falha', () => {
    expect(podeTransitarSolicitacao('PENDENTE', 'PENDENTE')).toBe(false)
  })

  it('validar lança TransicaoInvalidaError', () => {
    expect(() => validarTransicaoSolicitacao('APROVADA', 'PENDENTE')).toThrow(
      TransicaoInvalidaError,
    )
  })
})

describe('workflow / aquisitivo', () => {
  it.each([
    ['EM_CURSO', 'DISPONIVEL'],
    ['EM_CURSO', 'VENCIDO'],
    ['DISPONIVEL', 'EM_GOZO'],
    ['DISPONIVEL', 'ENCERRADO'],
    ['DISPONIVEL', 'VENCIDO'],
    ['EM_GOZO', 'DISPONIVEL'],
    ['EM_GOZO', 'ENCERRADO'],
  ] as const)('permite %s → %s', (from, to) => {
    expect(podeTransitarAquisitivo(from, to)).toBe(true)
  })

  it('ENCERRADO e VENCIDO são terminais', () => {
    expect(podeTransitarAquisitivo('ENCERRADO', 'DISPONIVEL')).toBe(false)
    expect(podeTransitarAquisitivo('VENCIDO', 'DISPONIVEL')).toBe(false)
  })

  it('validar lança', () => {
    expect(() => validarTransicaoAquisitivo('ENCERRADO', 'DISPONIVEL')).toThrow(
      TransicaoInvalidaError,
    )
  })
})

describe('workflow / gozo', () => {
  it.each([
    ['AGENDADO', 'EM_GOZO'],
    ['AGENDADO', 'CANCELADO'],
    ['EM_GOZO', 'CONCLUIDO'],
  ] as const)('permite %s → %s', (from, to) => {
    expect(podeTransitarGozo(from, to)).toBe(true)
  })

  it('CONCLUIDO e CANCELADO são terminais', () => {
    expect(podeTransitarGozo('CONCLUIDO', 'EM_GOZO')).toBe(false)
    expect(podeTransitarGozo('CANCELADO', 'AGENDADO')).toBe(false)
  })

  it('validar lança', () => {
    expect(() => validarTransicaoGozo('CONCLUIDO', 'EM_GOZO')).toThrow(TransicaoInvalidaError)
  })
})
