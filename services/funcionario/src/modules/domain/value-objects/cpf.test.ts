import { describe, expect, it } from 'vitest'

import { CpfInvalidoError } from '../errors/domain-error.js'
import { Cpf } from './cpf.js'

describe('Cpf value object', () => {
  describe('sanitize', () => {
    it('remove pontos e traços', () => {
      expect(Cpf.sanitize('123.456.789-00')).toBe('12345678900')
      expect(Cpf.sanitize(' 123 456 789 00 ')).toBe('12345678900')
    })

    it('aceita já sanitizado', () => {
      expect(Cpf.sanitize('12345678900')).toBe('12345678900')
    })
  })

  describe('isValid', () => {
    it('aceita CPFs com DV correto (calculados aqui mesmo)', () => {
      // CPFs reais conhecidos como válidos
      expect(Cpf.isValid('11144477735')).toBe(true)
      expect(Cpf.isValid('52998224725')).toBe(true)
    })

    it('rejeita comprimento diferente de 11 dígitos', () => {
      expect(Cpf.isValid('1234567890')).toBe(false)
      expect(Cpf.isValid('123456789012')).toBe(false)
      expect(Cpf.isValid('')).toBe(false)
    })

    it('rejeita não-numéricos', () => {
      expect(Cpf.isValid('abc45678900')).toBe(false)
    })

    it('rejeita sequências de dígitos repetidos', () => {
      expect(Cpf.isValid('00000000000')).toBe(false)
      expect(Cpf.isValid('11111111111')).toBe(false)
      expect(Cpf.isValid('99999999999')).toBe(false)
    })

    it('rejeita DV1 errado', () => {
      // 11144477735 é válido; trocar penúltimo dígito invalida
      expect(Cpf.isValid('11144477745')).toBe(false)
    })

    it('rejeita DV2 errado', () => {
      // 11144477735 é válido; trocar último dígito invalida
      expect(Cpf.isValid('11144477736')).toBe(false)
    })
  })

  describe('parse', () => {
    it('cria instância com value sanitizado', () => {
      const cpf = Cpf.parse('111.444.777-35')
      expect(cpf.value).toBe('11144477735')
    })

    it('lança CpfInvalidoError para CPF inválido', () => {
      expect(() => Cpf.parse('000.000.000-00')).toThrow(CpfInvalidoError)
      expect(() => Cpf.parse('123.456.789-10')).toThrow(CpfInvalidoError)
    })
  })

  describe('format', () => {
    it('retorna formato com máscara', () => {
      const cpf = Cpf.parse('11144477735')
      expect(cpf.format()).toBe('111.444.777-35')
    })
  })
})
