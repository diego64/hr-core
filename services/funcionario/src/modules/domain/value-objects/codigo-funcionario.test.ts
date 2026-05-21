import { describe, expect, it } from 'vitest'

import { CpfInvalidoError } from '../errors/domain-error.js'
import { Cpf } from './cpf.js'
import { gerarCodigoFuncionario } from './codigo-funcionario.js'

describe('gerarCodigoFuncionario', () => {
  it('aceita CPF como string com máscara', () => {
    expect(gerarCodigoFuncionario('111.444.777-35')).toBe('FUN11144477735')
  })

  it('aceita CPF como string sem máscara', () => {
    expect(gerarCodigoFuncionario('11144477735')).toBe('FUN11144477735')
  })

  it('aceita Cpf value object diretamente (sem revalidar)', () => {
    const cpf = Cpf.parse('111.444.777-35')
    expect(gerarCodigoFuncionario(cpf)).toBe('FUN11144477735')
  })

  it('lança CpfInvalidoError para CPF inválido', () => {
    expect(() => gerarCodigoFuncionario('123.456.789-00')).toThrow(CpfInvalidoError)
  })

  it('é determinístico — mesmo CPF gera mesmo código sempre', () => {
    const a = gerarCodigoFuncionario('111.444.777-35')
    const b = gerarCodigoFuncionario('111.444.777-35')
    expect(a).toEqual(b)
  })
})
