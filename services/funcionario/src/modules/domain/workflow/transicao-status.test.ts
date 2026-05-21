import { describe, expect, it } from 'vitest'

import { TransicaoInvalidaError } from '../errors/domain-error.js'
import { podeTransitar, validarTransicao } from './transicao-status.js'

describe('workflow.transicao-status', () => {
  describe('caminho feliz da admissão', () => {
    it.each([
      ['PENDENTE', 'EM_VALIDACAO'],
      ['EM_VALIDACAO', 'APROVADO'],
      ['APROVADO', 'ATIVO'],
    ] as const)('permite %s → %s', (from, to) => {
      expect(podeTransitar(from, to)).toBe(true)
    })
  })

  describe('reprovação', () => {
    it.each([
      ['PENDENTE', 'REPROVADO'],
      ['EM_VALIDACAO', 'REPROVADO'],
    ] as const)('permite %s → REPROVADO', (from, to) => {
      expect(podeTransitar(from, to)).toBe(true)
    })

    it('REPROVADO é terminal — não permite ressuscitar', () => {
      expect(podeTransitar('REPROVADO', 'ATIVO')).toBe(false)
      expect(podeTransitar('REPROVADO', 'PENDENTE')).toBe(false)
      expect(podeTransitar('REPROVADO', 'EM_VALIDACAO')).toBe(false)
    })
  })

  describe('pós-admissão', () => {
    it.each([
      ['ATIVO', 'AFASTADO'],
      ['ATIVO', 'INATIVO'],
      ['ATIVO', 'DESLIGADO'],
      ['AFASTADO', 'ATIVO'],
      ['INATIVO', 'ATIVO'],
      ['AFASTADO', 'DESLIGADO'],
      ['INATIVO', 'DESLIGADO'],
    ] as const)('permite %s → %s', (from, to) => {
      expect(podeTransitar(from, to)).toBe(true)
    })

    it('DESLIGADO é terminal', () => {
      expect(podeTransitar('DESLIGADO', 'ATIVO')).toBe(false)
      expect(podeTransitar('DESLIGADO', 'INATIVO')).toBe(false)
    })
  })

  describe('atalhos proibidos', () => {
    it.each([
      ['PENDENTE', 'ATIVO'], // pula validação
      ['PENDENTE', 'APROVADO'], // pula EM_VALIDACAO
      ['EM_VALIDACAO', 'ATIVO'], // pula APROVADO
      ['ATIVO', 'PENDENTE'], // volta atrás
      ['ATIVO', 'EM_VALIDACAO'],
      ['ATIVO', 'APROVADO'],
      ['ATIVO', 'REPROVADO'], // reprovação só antes de admitir
    ] as const)('rejeita %s → %s', (from, to) => {
      expect(podeTransitar(from, to)).toBe(false)
    })
  })

  it('mesma origem e destino sempre rejeita (caller deve evitar no-op)', () => {
    expect(podeTransitar('ATIVO', 'ATIVO')).toBe(false)
    expect(podeTransitar('PENDENTE', 'PENDENTE')).toBe(false)
  })

  describe('validarTransicao', () => {
    it('não lança em transição válida', () => {
      expect(() => validarTransicao('PENDENTE', 'EM_VALIDACAO')).not.toThrow()
    })

    it('lança TransicaoInvalidaError em transição inválida — mensagem inclui ambos os estados', () => {
      expect(() => validarTransicao('ATIVO', 'PENDENTE')).toThrow(TransicaoInvalidaError)
      try {
        validarTransicao('ATIVO', 'PENDENTE')
      } catch (err) {
        expect((err as TransicaoInvalidaError).statusCode).toBe(422)
        expect((err as TransicaoInvalidaError).message).toContain('ATIVO')
        expect((err as TransicaoInvalidaError).message).toContain('PENDENTE')
      }
    })
  })
})
