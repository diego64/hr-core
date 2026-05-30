import { NotaInvalidaError } from '../errors/domain-error.js'

export const NOTAS_VALIDAS = [1, 2, 3, 4, 5] as const
export type NotaValor = (typeof NOTAS_VALIDAS)[number]

/**
 * Value Object Nota — inteiro entre 1 e 5 (inclusive).
 *
 * O parser rejeita strings, floats, fora do intervalo e NaN. Use `Nota.parse`
 * quando o input vem de fonte não confiável (HTTP, Kafka). O Zod do schema
 * de rota já valida — esta camada existe pra blindar use cases que sejam
 * chamados por outros caminhos (jobs, seeds, testes).
 */
export class Nota {
  private constructor(public readonly value: NotaValor) {}

  static parse(input: unknown): Nota {
    if (typeof input !== 'number' || !Number.isInteger(input)) {
      throw new NotaInvalidaError(input)
    }
    if (!NOTAS_VALIDAS.includes(input as NotaValor)) {
      throw new NotaInvalidaError(input)
    }
    return new Nota(input as NotaValor)
  }

  static isValid(input: unknown): boolean {
    return (
      typeof input === 'number' &&
      Number.isInteger(input) &&
      NOTAS_VALIDAS.includes(input as NotaValor)
    )
  }
}
