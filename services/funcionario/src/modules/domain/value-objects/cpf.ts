import { CpfInvalidoError } from '../errors/domain-error.js'

/**
 * Value object para CPF. Sanitiza, valida o dígito verificador (algoritmo
 * oficial da Receita) e fornece formatação para apresentação.
 *
 * O storage canônico é o CPF *sem máscara* (11 dígitos puros). A máscara
 * é apenas formato de exibição.
 */
export class Cpf {
  private constructor(public readonly value: string) {}

  /**
   * Cria um Cpf a partir de string com ou sem máscara. Lança CpfInvalidoError
   * se não passar pela validação.
   */
  static parse(input: string): Cpf {
    const sanitized = Cpf.sanitize(input)
    if (!Cpf.isValid(sanitized)) {
      throw new CpfInvalidoError(input)
    }
    return new Cpf(sanitized)
  }

  /**
   * Remove qualquer caractere não-numérico. Útil pra normalizar input do
   * usuário ("123.456.789-00" → "12345678900").
   */
  static sanitize(input: string): string {
    return input.replace(/\D/g, '')
  }

  /**
   * Valida o CPF aplicando o algoritmo de dígito verificador da Receita
   * Federal. Retorna false para:
   *   - tamanho ≠ 11 dígitos
   *   - sequências repetidas (000.000.000-00, 111.111.111-11, ...)
   *   - DV1 ou DV2 não conferem
   */
  static isValid(sanitized: string): boolean {
    if (!/^\d{11}$/.test(sanitized)) return false
    // Rejeita sequências repetidas (todos zeros, todos uns, etc.)
    if (/^(\d)\1{10}$/.test(sanitized)) return false

    const digits = sanitized.split('').map((c) => Number(c))

    // Calcula DV1
    let sum = 0
    for (let i = 0; i < 9; i++) sum += (digits[i] ?? 0) * (10 - i)
    let dv1 = 11 - (sum % 11)
    if (dv1 >= 10) dv1 = 0
    if (dv1 !== digits[9]) return false

    // Calcula DV2 (inclui DV1 no cálculo)
    sum = 0
    for (let i = 0; i < 10; i++) sum += (digits[i] ?? 0) * (11 - i)
    let dv2 = 11 - (sum % 11)
    if (dv2 >= 10) dv2 = 0
    if (dv2 !== digits[10]) return false

    return true
  }

  /**
   * Formato com máscara: "123.456.789-00".
   */
  format(): string {
    const v = this.value
    return `${v.slice(0, 3)}.${v.slice(3, 6)}.${v.slice(6, 9)}-${v.slice(9, 11)}`
  }
}
