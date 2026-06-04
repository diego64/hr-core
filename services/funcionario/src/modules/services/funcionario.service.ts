import type { EventPublisher } from '../../infrastructure/messaging/event-publisher.js'
import {
  CpfDuplicadoError,
  EmailDuplicadoError,
  FuncionarioJaDesligadoError,
  FuncionarioNaoEncontradoError,
} from '../domain/errors/domain-error.js'
import { toPublicFuncionario, type PublicFuncionario } from '../domain/entities/funcionario.js'
import { Cpf } from '../domain/value-objects/cpf.js'
import { gerarCodigoFuncionario } from '../domain/value-objects/codigo-funcionario.js'
import { gerarCodigoHR } from '../domain/value-objects/codigo-hr.js'
import type { ContadorRepository } from '../repositories/contador.repository.js'
import type {
  FuncionarioRepository,
  ListFuncionariosFilter,
  ListFuncionariosPage,
} from '../repositories/funcionario.repository.js'

export interface CriarFuncionarioInput {
  readonly nome: string
  readonly cpf: string
  readonly email: string
  readonly telefone: string
  readonly cargo: string
  readonly departamento: string
  readonly gestorId?: string | null
  /**
   * Salário e dependentes ainda não têm domínio próprio no ms-funcionario
   * (vem em PR futura). Quando informados — hoje só pelo seed — viajam no
   * evento `FuncionarioCriado` para o ms-folha-pagamento popular o cache.
   * Em produção (criação via API) ficam no default 0 até o domínio existir.
   */
  readonly salarioBase?: number
  readonly numeroDependentes?: number
}

export interface ListaPublicaFuncionarios {
  readonly items: PublicFuncionario[]
  readonly total: number
  readonly page: number
  readonly limit: number
  readonly pages: number
}

export class FuncionarioService {
  constructor(
    private readonly repo: FuncionarioRepository,
    private readonly contadorRepo: ContadorRepository,
    private readonly events: EventPublisher,
  ) {}

  /**
   * Cria o funcionário, garantindo:
   *   - CPF válido (algoritmo) e único na collection
   *   - e-mail único (case-insensitive)
   *   - codigoFun derivado do CPF (FUN + 11 dígitos)
   *   - codigoHR sequencial via contador atômico ($inc + upsert)
   *
   * Status inicial é PENDENTE — o funcionário só vira ATIVO após o workflow
   * de admissão (upload de documentos → aprovação do coordenador → validação
   * eSocial). score, asoValido e ctpsDigital nascem zerados/false.
   */
  async criar(input: CriarFuncionarioInput): Promise<PublicFuncionario> {
    const cpf = Cpf.parse(input.cpf)

    const [byCpf, byEmail] = await Promise.all([
      this.repo.findByCpf(cpf.value),
      this.repo.findByEmail(input.email),
    ])
    if (byCpf) throw new CpfDuplicadoError(cpf.format())
    if (byEmail) throw new EmailDuplicadoError(input.email)

    const codigoFun = gerarCodigoFuncionario(cpf)
    const sequencia = await this.contadorRepo.proximoValor('HR')
    const codigoHR = gerarCodigoHR(sequencia)

    const created = await this.repo.create({
      codigoFun,
      codigoHR,
      nome: input.nome,
      cpf: cpf.value,
      email: input.email,
      telefone: input.telefone,
      cargo: input.cargo,
      departamento: input.departamento,
      gestorId: input.gestorId ?? null,
      status: 'PENDENTE',
    })

    // Publica evento de domínio APÓS persistência confirmada — padrão CLAUDE.md
    // (salva no banco → publica no Kafka → consumidores reagem). Os consumers
    // de folha-pagamento, ferias e avaliacao usam esse payload para popular
    // funcionarios_cache local. salarioBase/numeroDependentes ainda não têm
    // domínio próprio: default 0 em produção, valores do seed quando informados.
    await this.events.publish({
      eventType: 'FuncionarioCriado',
      aggregateId: created._id.toHexString(),
      payload: {
        funcionarioId: created._id.toHexString(),
        codigoFun: created.codigoFun,
        codigoHR: created.codigoHR,
        nome: created.nome,
        setor: created.departamento,
        salarioBase: input.salarioBase ?? 0,
        numeroDependentes: input.numeroDependentes ?? 0,
      },
    })

    return toPublicFuncionario(created)
  }

  async buscarPorId(id: string): Promise<PublicFuncionario> {
    const found = await this.repo.findById(id)
    if (!found) throw new FuncionarioNaoEncontradoError(id)
    return toPublicFuncionario(found)
  }

  async buscarPorCodigoFun(codigoFun: string): Promise<PublicFuncionario> {
    const found = await this.repo.findByCodigoFun(codigoFun)
    if (!found) throw new FuncionarioNaoEncontradoError(codigoFun)
    return toPublicFuncionario(found)
  }

  async listar(
    filter: ListFuncionariosFilter,
    page: number,
    limit: number,
  ): Promise<ListaPublicaFuncionarios> {
    const result: ListFuncionariosPage = await this.repo.list(filter, page, limit)
    return {
      ...result,
      items: result.items.map(toPublicFuncionario),
    }
  }

  /**
   * Soft delete — marca como DESLIGADO. Idempotente do ponto de vista do
   * cliente: já desligado lança FuncionarioJaDesligadoError (409) para o
   * caller poder distinguir entre "acabei de desligar" e "tentou de novo".
   */
  async desligar(id: string): Promise<void> {
    const found = await this.repo.findById(id)
    if (!found) throw new FuncionarioNaoEncontradoError(id)
    if (found.status === 'DESLIGADO') throw new FuncionarioJaDesligadoError()

    const ok = await this.repo.desligar(id)
    if (!ok) {
      // Race: outro request desligou entre o findById e o desligar.
      throw new FuncionarioJaDesligadoError()
    }
  }
}
