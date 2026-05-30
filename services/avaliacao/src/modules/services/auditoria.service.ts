import type { AuditoriaAcao, CreateAuditoriaInput } from '../domain/entities/auditoria.js'
import type { AuditoriaRepository } from '../repositories/auditoria.repository.js'

export interface RegistroAuditoriaInput {
  readonly usuarioId: string | null
  readonly acao: AuditoriaAcao
  readonly recurso: string
  readonly recursoId: string
  readonly valorAnterior?: Record<string, unknown> | null
  readonly valorNovo?: Record<string, unknown> | null
  readonly ip?: string | null
  readonly userAgent?: string | null
}

export class AuditoriaService {
  constructor(private readonly repo: AuditoriaRepository) {}

  async registrar(input: RegistroAuditoriaInput): Promise<void> {
    const create: CreateAuditoriaInput = {
      usuarioId: input.usuarioId,
      acao: input.acao,
      recurso: input.recurso,
      recursoId: input.recursoId,
      valorAnterior: input.valorAnterior ?? null,
      valorNovo: input.valorNovo ?? null,
      ip: input.ip ?? null,
      userAgent: input.userAgent ?? null,
    }
    await this.repo.create(create)
  }
}
