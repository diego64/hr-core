import { describe, expect, it } from 'vitest'

import { TransicaoFolhaInvalidaError } from '../errors/domain-error.js'
import { podeTransitarFolha, validarTransicaoFolha } from './transicao-folha.js'

describe('domain/workflow — transicao-folha', () => {
  it('caminho feliz completo: ABERTA → PROCESSADA → APROVADA → PAGA → FECHADA', () => {
    expect(podeTransitarFolha('ABERTA', 'PROCESSADA')).toBe(true)
    expect(podeTransitarFolha('PROCESSADA', 'APROVADA')).toBe(true)
    expect(podeTransitarFolha('APROVADA', 'PAGA')).toBe(true)
    expect(podeTransitarFolha('PAGA', 'FECHADA')).toBe(true)
  })

  it('rejeição: PROCESSADA → REJEITADA → ABERTA (reprocessamento)', () => {
    expect(podeTransitarFolha('PROCESSADA', 'REJEITADA')).toBe(true)
    expect(podeTransitarFolha('REJEITADA', 'ABERTA')).toBe(true)
  })

  it('FECHADA é terminal — nenhuma saída', () => {
    expect(podeTransitarFolha('FECHADA', 'ABERTA')).toBe(false)
    expect(podeTransitarFolha('FECHADA', 'PROCESSADA')).toBe(false)
    expect(podeTransitarFolha('FECHADA', 'PAGA')).toBe(false)
  })

  it('não permite pular etapas (ABERTA → APROVADA)', () => {
    expect(podeTransitarFolha('ABERTA', 'APROVADA')).toBe(false)
    expect(podeTransitarFolha('ABERTA', 'PAGA')).toBe(false)
    expect(podeTransitarFolha('PROCESSADA', 'PAGA')).toBe(false)
  })

  it('transição para o mesmo estado é inválida', () => {
    expect(podeTransitarFolha('ABERTA', 'ABERTA')).toBe(false)
    expect(podeTransitarFolha('APROVADA', 'APROVADA')).toBe(false)
  })

  it('validarTransicaoFolha lança DomainError com from/to', () => {
    expect(() => validarTransicaoFolha('ABERTA', 'PAGA')).toThrow(TransicaoFolhaInvalidaError)
    expect(() => validarTransicaoFolha('FECHADA', 'ABERTA')).toThrow(TransicaoFolhaInvalidaError)
  })
})
