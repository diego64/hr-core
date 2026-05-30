import { DomainError } from '../errors/domain-error.js'

export class CpfInvalidoError extends DomainError {
  constructor(cpf: string) {
    super({
      code: 'cpf-invalido',
      title: 'CPF inválido',
      message: `O CPF informado é inválido: ${cpf}`,
      statusCode: 422,
    })
  }
}

/**
 * Value Object CPF. Mesmo algoritmo do funcionario service — mantemos
 * implementações independentes em vez de extrair pra um @hr-core/shared
 * porque o overhead de versioning não compensa pra 60 linhas de código
 * com regras estáveis (algoritmo do CPF não muda em ~50 anos).
 */
export class Cpf {
  private constructor(private readonly canonical: string) {}

  static sanitize(input: string): string {
    return input.replace(/\D/g, '')
  }

  static parse(input: string): Cpf {
    const canonical = Cpf.sanitize(input)
    if (!Cpf.isValid(canonical)) {
      throw new CpfInvalidoError(input)
    }
    return new Cpf(canonical)
  }

  static isValid(canonical: string): boolean {
    if (canonical.length !== 11) return false
    if (/^(\d)\1{10}$/.test(canonical)) return false

    const calcDigit = (slice: string, factor: number): number => {
      let sum = 0
      for (let i = 0; i < slice.length; i++) {
        sum += Number(slice[i]) * (factor - i)
      }
      const rem = (sum * 10) % 11
      return rem === 10 ? 0 : rem
    }

    const d1 = calcDigit(canonical.slice(0, 9), 10)
    if (d1 !== Number(canonical[9])) return false
    const d2 = calcDigit(canonical.slice(0, 10), 11)
    return d2 === Number(canonical[10])
  }

  get value(): string {
    return this.canonical
  }

  format(): string {
    const c = this.canonical
    return `${c.slice(0, 3)}.${c.slice(3, 6)}.${c.slice(6, 9)}-${c.slice(9, 11)}`
  }
}
