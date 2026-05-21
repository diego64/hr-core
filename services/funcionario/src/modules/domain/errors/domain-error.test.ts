import { describe, expect, it } from 'vitest'

import {
  CpfDuplicadoError,
  CpfInvalidoError,
  DomainError,
  EmailDuplicadoError,
  FuncionarioJaDesligadoError,
  FuncionarioNaoEncontradoError,
  TransicaoInvalidaError,
} from './domain-error.js'

describe('domain.errors', () => {
  it('DomainError preserva code/title/statusCode/message', () => {
    const err = new DomainError({
      code: 'x',
      title: 'X',
      statusCode: 418,
      message: 'msg',
    })
    expect(err).toBeInstanceOf(Error)
    expect(err.name).toBe('DomainError')
    expect(err.code).toBe('x')
    expect(err.title).toBe('X')
    expect(err.statusCode).toBe(418)
    expect(err.message).toBe('msg')
  })

  it('CpfInvalidoError → 422 com code cpf-invalido', () => {
    const err = new CpfInvalidoError('123')
    expect(err.code).toBe('cpf-invalido')
    expect(err.statusCode).toBe(422)
    expect(err.message).toContain('123')
  })

  it('CpfDuplicadoError → 409', () => {
    const err = new CpfDuplicadoError('111.444.777-35')
    expect(err.code).toBe('cpf-duplicado')
    expect(err.statusCode).toBe(409)
    expect(err.message).toContain('111.444.777-35')
  })

  it('EmailDuplicadoError → 409', () => {
    const err = new EmailDuplicadoError('a@x.com')
    expect(err.code).toBe('email-duplicado')
    expect(err.statusCode).toBe(409)
  })

  it('FuncionarioNaoEncontradoError → 404', () => {
    const err = new FuncionarioNaoEncontradoError('abc')
    expect(err.code).toBe('funcionario-nao-encontrado')
    expect(err.statusCode).toBe(404)
  })

  it('FuncionarioJaDesligadoError → 409', () => {
    const err = new FuncionarioJaDesligadoError()
    expect(err.code).toBe('funcionario-ja-desligado')
    expect(err.statusCode).toBe(409)
  })

  it('TransicaoInvalidaError → 422 com from/to na mensagem', () => {
    const err = new TransicaoInvalidaError('ATIVO', 'PENDENTE')
    expect(err.code).toBe('transicao-invalida')
    expect(err.statusCode).toBe(422)
    expect(err.message).toContain('ATIVO')
    expect(err.message).toContain('PENDENTE')
  })
})
