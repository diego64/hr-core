/**
 * Cache local do funcionário, replicado via eventos Kafka publicados pelo
 * ms-funcionarios (`FuncionarioCriado`, `SalarioAlterado`, `DependenteAdicionado`,
 * `FuncionarioDesligado`). Permite calcular folha sem chamada síncrona ao
 * ms-funcionarios — preserva o desacoplamento por mensageria.
 *
 * Enquanto Kafka não está conectado, este cache pode ser populado manualmente
 * via fixture/seed para desenvolvimento local.
 */
export interface FuncionarioCache {
  readonly _id: string // funcionarioId (UUID)
  readonly codigoFun: string
  readonly nome: string
  readonly setor: string | null
  readonly salarioBase: number
  readonly numeroDependentes: number
  readonly ativo: boolean
  readonly updatedAt: Date
}

export interface UpsertFuncionarioCacheInput {
  readonly funcionarioId: string
  readonly codigoFun: string
  readonly nome: string
  readonly setor?: string | null
  readonly salarioBase: number
  readonly numeroDependentes: number
  readonly ativo: boolean
}
