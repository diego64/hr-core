import {
  AprovacaoJaProcessadaError,
  AprovacaoNaoEncontradaError,
  FuncionarioInaptoParaAlteracaoError,
  FuncionarioNaoEncontradoError,
  SemCamposParaAlterarError,
} from '../domain/errors/domain-error.js'
import {
  toPublicAprovacao,
  type CamposEditaveis,
  type PublicAprovacao,
} from '../domain/entities/aprovacao.js'
import type { FuncionarioStatus } from '../domain/entities/funcionario.js'
import type {
  AprovacaoRepository,
  ListAprovacoesFilter,
} from '../repositories/aprovacao.repository.js'
import type { FuncionarioRepository } from '../repositories/funcionario.repository.js'

/**
 * Estados em que o funcionário NÃO aceita alterações cadastrais. DESLIGADO
 * é terminal; REPROVADO foi rejeitado na admissão; INATIVO é um soft-disable
 * que exige reativação antes de qualquer mudança.
 */
const STATUS_INAPTOS: ReadonlySet<FuncionarioStatus> = new Set([
  'DESLIGADO',
  'REPROVADO',
  'INATIVO',
])

export interface SolicitarAlteracaoInput {
  readonly funcionarioId: string
  readonly camposAlterados: CamposEditaveis
  readonly solicitadoPor: string
}

export class AprovacaoService {
  constructor(
    private readonly repo: AprovacaoRepository,
    private readonly funcionarioRepo: FuncionarioRepository,
  ) {}

  /**
   * USUARIO solicita alteração cadastral. Não aplica nada no funcionário —
   * cria uma Aprovacao PENDENTE que precisa ser aprovada por COORDENADOR.
   *
   * Valida que o funcionário existe e está em estado apto. Valida que
   * pelo menos 1 campo foi informado. Não há tentativa de detectar
   * duplicatas (duas solicitações pendentes para os mesmos campos podem
   * coexistir — o COORDENADOR resolve qual aprovar primeiro).
   */
  async solicitar(input: SolicitarAlteracaoInput): Promise<PublicAprovacao> {
    const campos = filtrarCamposDefinidos(input.camposAlterados)
    if (Object.keys(campos).length === 0) throw new SemCamposParaAlterarError()

    const funcionario = await this.funcionarioRepo.findById(input.funcionarioId)
    if (!funcionario) throw new FuncionarioNaoEncontradoError(input.funcionarioId)
    if (STATUS_INAPTOS.has(funcionario.status)) {
      throw new FuncionarioInaptoParaAlteracaoError(funcionario.status)
    }

    const created = await this.repo.create({
      funcionarioId: funcionario._id,
      tipo: 'ALTERACAO_CADASTRAL',
      camposAlterados: campos,
      solicitadoPor: input.solicitadoPor,
    })
    return toPublicAprovacao(created)
  }

  async listar(filter: ListAprovacoesFilter = {}): Promise<PublicAprovacao[]> {
    const items = await this.repo.list(filter)
    return items.map(toPublicAprovacao)
  }

  async buscarPorId(id: string): Promise<PublicAprovacao> {
    const a = await this.repo.findById(id)
    if (!a) throw new AprovacaoNaoEncontradaError(id)
    return toPublicAprovacao(a)
  }

  /**
   * COORDENADOR aprova. Re-valida que o funcionário ainda está apto
   * (estados podem ter mudado entre solicitar e aprovar). Aplica o payload
   * via atualizarCampos e marca a Aprovacao como APROVADA.
   *
   * Ordem das ops: marca a Aprovacao PRIMEIRO (atômico, com filtro
   * `status: PENDENTE`) — assim duas aprovações concorrentes não duplicam
   * a aplicação. Em caso de race, a segunda recebe `false` no aprovar e
   * lança 409.
   */
  async aprovar(id: string, aprovadoPor: string): Promise<PublicAprovacao> {
    const atual = await this.repo.findById(id)
    if (!atual) throw new AprovacaoNaoEncontradaError(id)
    if (atual.status !== 'PENDENTE') {
      throw new AprovacaoJaProcessadaError(atual.status)
    }

    const funcionario = await this.funcionarioRepo.findById(atual.funcionarioId)
    if (!funcionario) throw new FuncionarioNaoEncontradoError(atual.funcionarioId.toHexString())
    if (STATUS_INAPTOS.has(funcionario.status)) {
      throw new FuncionarioInaptoParaAlteracaoError(funcionario.status)
    }

    const ganhou = await this.repo.aprovar(atual._id, aprovadoPor)
    if (!ganhou) throw new AprovacaoJaProcessadaError('APROVADA')

    await this.funcionarioRepo.atualizarCampos(atual.funcionarioId, atual.camposAlterados)

    const atualizada = await this.repo.findById(atual._id)
    return toPublicAprovacao(atualizada!) // garantido — acabou de existir
  }

  async rejeitar(id: string, aprovadoPor: string, motivo: string): Promise<PublicAprovacao> {
    const atual = await this.repo.findById(id)
    if (!atual) throw new AprovacaoNaoEncontradaError(id)
    if (atual.status !== 'PENDENTE') {
      throw new AprovacaoJaProcessadaError(atual.status)
    }
    const ganhou = await this.repo.rejeitar(atual._id, aprovadoPor, motivo)
    if (!ganhou) throw new AprovacaoJaProcessadaError('REJEITADA')

    const atualizada = await this.repo.findById(atual._id)
    return toPublicAprovacao(atualizada!)
  }
}

function filtrarCamposDefinidos(input: CamposEditaveis): CamposEditaveis {
  const out: Record<string, string | null> = {}
  if (input.telefone !== undefined) out.telefone = input.telefone
  if (input.cargo !== undefined) out.cargo = input.cargo
  if (input.departamento !== undefined) out.departamento = input.departamento
  if (input.gestorId !== undefined) out.gestorId = input.gestorId
  return out
}
