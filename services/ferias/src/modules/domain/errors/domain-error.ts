export class DomainError extends Error {
  public readonly code: string
  public readonly statusCode: number
  public readonly title: string

  constructor(args: { code: string; message: string; statusCode: number; title: string }) {
    super(args.message)
    this.name = 'DomainError'
    this.code = args.code
    this.statusCode = args.statusCode
    this.title = args.title
  }
}

// Recursos não encontrados
export class PeriodoAquisitivoNaoEncontradoError extends DomainError {
  constructor(funcionarioId: string) {
    super({
      code: 'periodo-aquisitivo-nao-encontrado',
      title: 'Período aquisitivo não encontrado',
      message: `Funcionário ${funcionarioId} não possui período aquisitivo vigente`,
      statusCode: 404,
    })
  }
}

export class SolicitacaoNaoEncontradaError extends DomainError {
  constructor(id: string) {
    super({
      code: 'solicitacao-nao-encontrada',
      title: 'Solicitação de férias não encontrada',
      message: `Nenhuma solicitação com identificador ${id}`,
      statusCode: 404,
    })
  }
}

export class PeriodoGozoNaoEncontradoError extends DomainError {
  constructor(id: string) {
    super({
      code: 'periodo-gozo-nao-encontrado',
      title: 'Período de gozo não encontrado',
      message: `Nenhum período de gozo com identificador ${id}`,
      statusCode: 404,
    })
  }
}

// Regras CLT (422)
export class SaldoInsuficienteError extends DomainError {
  constructor(saldoDias: number, solicitados: number) {
    super({
      code: 'saldo-insuficiente',
      title: 'Saldo de dias insuficiente',
      message: `O funcionário possui ${saldoDias} dias de saldo. Solicitação requer ${solicitados} dias.`,
      statusCode: 422,
    })
  }
}

export class FracionamentoExcedidoError extends DomainError {
  constructor(maxFracoes = 3) {
    super({
      code: 'fracionamento-excedido',
      title: 'Limite de frações excedido',
      message: `Já existem ${maxFracoes} frações neste período aquisitivo. CLT permite no máximo ${maxFracoes}.`,
      statusCode: 422,
    })
  }
}

export class PeriodoMinimoInvalidoError extends DomainError {
  constructor(diasSolicitados: number, minimoExigido: number, primeiroPeriodo: boolean) {
    const contexto = primeiroPeriodo
      ? 'O primeiro período de gozo precisa ter no mínimo 14 dias corridos'
      : 'Os demais períodos precisam ter no mínimo 5 dias corridos cada'
    super({
      code: 'periodo-minimo-invalido',
      title: 'Período mínimo de gozo inválido',
      message: `${contexto}. Solicitação: ${diasSolicitados} dias (mínimo ${minimoExigido}).`,
      statusCode: 422,
    })
  }
}

export class AntecedenciaInsuficienteError extends DomainError {
  constructor(diasAntecedencia: number, minimo: number) {
    super({
      code: 'antecedencia-insuficiente',
      title: 'Antecedência insuficiente',
      message: `Solicitação com ${diasAntecedencia} dias de antecedência. Mínimo exigido: ${minimo} dias.`,
      statusCode: 422,
    })
  }
}

export class InicioInvalidoError extends DomainError {
  constructor(motivo: string) {
    super({
      code: 'inicio-invalido',
      title: 'Data de início inválida',
      message: `Início de período de férias inválido: ${motivo}`,
      statusCode: 422,
    })
  }
}

export class AbonoInvalidoError extends DomainError {
  constructor(motivo: string) {
    super({
      code: 'abono-invalido',
      title: 'Abono pecuniário inválido',
      message: motivo,
      statusCode: 422,
    })
  }
}

export class PeriodoVencidoError extends DomainError {
  constructor(dataLimite: Date) {
    super({
      code: 'periodo-vencido',
      title: 'Período aquisitivo vencido',
      message: `Período aquisitivo venceu em ${dataLimite.toISOString().slice(0, 10)} — exposição a infração trabalhista. Resolva via ADMINISTRADOR.`,
      statusCode: 422,
    })
  }
}

export class JustificativaObrigatoriaError extends DomainError {
  constructor() {
    super({
      code: 'justificativa-obrigatoria',
      title: 'Justificativa obrigatória',
      message:
        'Rejeição de solicitação de férias exige justificativa não vazia (mínimo 3 caracteres).',
      statusCode: 422,
    })
  }
}

// Conflitos de estado (409)
export class SolicitacaoNaoPendenteError extends DomainError {
  constructor(statusAtual: string) {
    super({
      code: 'solicitacao-nao-pendente',
      title: 'Solicitação já processada',
      message: `Solicitação está em estado ${statusAtual} e não pode ser reprocessada.`,
      statusCode: 409,
    })
  }
}

export class CancelamentoInvalidoError extends DomainError {
  constructor(motivo: string) {
    super({
      code: 'cancelamento-invalido',
      title: 'Cancelamento não permitido',
      message: motivo,
      statusCode: 409,
    })
  }
}

export class TransicaoInvalidaError extends DomainError {
  constructor(from: string, to: string) {
    super({
      code: 'transicao-invalida',
      title: 'Transição de status inválida',
      message: `Não é permitido transitar de ${from} para ${to}.`,
      statusCode: 422,
    })
  }
}
