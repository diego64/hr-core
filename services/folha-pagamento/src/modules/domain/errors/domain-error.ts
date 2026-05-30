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
export class FolhaNaoEncontradaError extends DomainError {
  constructor(idOuCodigo: string) {
    super({
      code: 'folha-nao-encontrada',
      title: 'Folha não encontrada',
      message: `Nenhuma folha com identificador ${idOuCodigo}`,
      statusCode: 404,
    })
  }
}

export class FuncionarioCacheNaoEncontradoError extends DomainError {
  constructor(codigoFun: string) {
    super({
      code: 'funcionario-cache-nao-encontrado',
      title: 'Funcionário não encontrado no cache local',
      message: `Sem dados de salário/dependentes para ${codigoFun}. Aguarde a sincronização via Kafka (FuncionarioCriado).`,
      statusCode: 404,
    })
  }
}

export class HoleriteNaoEncontradoError extends DomainError {
  constructor(codigoFun: string, competencia: string) {
    super({
      code: 'holerite-nao-encontrado',
      title: 'Holerite não encontrado',
      message: `Nenhum holerite para ${codigoFun} na competência ${competencia}`,
      statusCode: 404,
    })
  }
}

// Conflitos de estado (409)
export class FolhaCompetenciaDuplicadaError extends DomainError {
  constructor(codigoFun: string, tipo: string, competencia: string) {
    super({
      code: 'folha-competencia-duplicada',
      title: 'Folha já existe para esta competência',
      message: `Já existe uma folha ${tipo} para ${codigoFun} na competência ${competencia}.`,
      statusCode: 409,
    })
  }
}

export class FolhaStatusInvalidoError extends DomainError {
  constructor(operacao: string, statusAtual: string) {
    super({
      code: 'folha-status-invalido',
      title: 'Status inválido para a operação',
      message: `Operação "${operacao}" não é permitida em folha com status ${statusAtual}.`,
      statusCode: 409,
    })
  }
}

export class FolhaImutavelError extends DomainError {
  constructor() {
    super({
      code: 'folha-imutavel',
      title: 'Folha imutável',
      message: 'Folha FECHADA não pode ser alterada por nenhum perfil, incluindo ADMINISTRADOR.',
      statusCode: 409,
    })
  }
}

export class TransicaoFolhaInvalidaError extends DomainError {
  constructor(from: string, to: string) {
    super({
      code: 'folha-transicao-invalida',
      title: 'Transição de status inválida',
      message: `Não é permitido transitar folha de ${from} para ${to}.`,
      statusCode: 409,
    })
  }
}

// Regras de domínio (422)
export class JustificativaRejeicaoObrigatoriaError extends DomainError {
  constructor() {
    super({
      code: 'folha-justificativa-obrigatoria',
      title: 'Justificativa obrigatória',
      message: 'Rejeição de folha exige justificativa não vazia (mínimo 3 caracteres).',
      statusCode: 422,
    })
  }
}

export class VerbaInvalidaError extends DomainError {
  constructor(motivo: string) {
    super({
      code: 'folha-verba-invalida',
      title: 'Verba inválida',
      message: motivo,
      statusCode: 422,
    })
  }
}

export class VerbaNaoEncontradaError extends DomainError {
  constructor(codigoVerba: string) {
    super({
      code: 'folha-verba-nao-encontrada',
      title: 'Verba não encontrada na folha',
      message: `Nenhuma verba com código ${codigoVerba} foi lançada nesta folha.`,
      statusCode: 404,
    })
  }
}

export class FuncionarioInativoError extends DomainError {
  constructor(codigoFun: string) {
    super({
      code: 'folha-funcionario-inativo',
      title: 'Funcionário inativo',
      message: `Funcionário ${codigoFun} está desligado e não pode ter folha aberta.`,
      statusCode: 422,
    })
  }
}

export class SalarioNaoInformadoError extends DomainError {
  constructor(codigoFun: string) {
    super({
      code: 'folha-salario-nao-informado',
      title: 'Salário base não informado',
      message: `Funcionário ${codigoFun} não possui salário base cadastrado no cache local.`,
      statusCode: 422,
    })
  }
}

export class CompetenciaInvalidaError extends DomainError {
  constructor(competencia: string, tipoFolha: string) {
    super({
      code: 'folha-competencia-invalida',
      title: 'Competência inválida',
      message: `Competência "${competencia}" não é compatível com o tipo de folha ${tipoFolha}. Mensal/Adiantamento esperam AAAA-MM; 13º espera AAAA.`,
      statusCode: 422,
    })
  }
}
