import { describe, expect, it } from 'vitest'

import { Cpf, CpfInvalidoError } from './cpf.js'
import { gerarCodigoFuncionario } from './codigo-funcionario.js'

describe('Cpf', () => {
  it('parse aceita formatado e canônico', () => {
    expect(Cpf.parse('111.444.777-35').value).toBe('11144477735')
    expect(Cpf.parse('11144477735').value).toBe('11144477735')
  })

  it('parse rejeita inválido (dígito verificador errado)', () => {
    expect(() => Cpf.parse('11144477700')).toThrow(CpfInvalidoError)
  })

  it('rejeita sequências repetidas (000..., 111..., etc.)', () => {
    expect(() => Cpf.parse('11111111111')).toThrow(CpfInvalidoError)
    expect(() => Cpf.parse('00000000000')).toThrow(CpfInvalidoError)
  })

  it('format reescreve com máscara', () => {
    expect(Cpf.parse('11144477735').format()).toBe('111.444.777-35')
  })

  it('sanitize tira não-dígitos', () => {
    expect(Cpf.sanitize('111.444.777-35')).toBe('11144477735')
    expect(Cpf.sanitize('  111 444 777 35  ')).toBe('11144477735')
  })

  it('isValid sem precisar instanciar', () => {
    expect(Cpf.isValid('11144477735')).toBe(true)
    expect(Cpf.isValid('11144477700')).toBe(false)
    expect(Cpf.isValid('123')).toBe(false)
  })
})

describe('gerarCodigoFuncionario', () => {
  it('FUN + CPF canônico (11 dígitos)', () => {
    expect(gerarCodigoFuncionario(Cpf.parse('111.444.777-35'))).toBe('FUN11144477735')
  })

  it('determinístico — mesma instância => mesmo código', () => {
    const a = gerarCodigoFuncionario(Cpf.parse('11144477735'))
    const b = gerarCodigoFuncionario(Cpf.parse('111.444.777-35'))
    expect(a).toBe(b)
  })
})
