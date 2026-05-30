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

// Recursos não encontrados (404)
export class AvaliadorNaoEncontradoError extends DomainError {
  constructor(id: string) {
    super({
      code: 'avaliacao.avaliador-nao-encontrado',
      title: 'Avaliador não encontrado',
      message: `Nenhum avaliador com identificador ${id}`,
      statusCode: 404,
    })
  }
}

export class AvaliacaoNaoEncontradaError extends DomainError {
  constructor(id: string) {
    super({
      code: 'avaliacao.nao-encontrada',
      title: 'Avaliação não encontrada',
      message: `Nenhuma avaliação com identificador ${id}`,
      statusCode: 404,
    })
  }
}

export class FuncionarioNaoEncontradoError extends DomainError {
  constructor(codigoFun: string) {
    super({
      code: 'avaliacao.funcionario-nao-encontrado',
      title: 'Funcionário não encontrado',
      message: `Funcionário ${codigoFun} não foi sincronizado no cache do ms-avaliacao`,
      statusCode: 404,
    })
  }
}

// Validação (422)
export class NotaInvalidaError extends DomainError {
  constructor(valor: unknown) {
    super({
      code: 'avaliacao.nota-invalida',
      title: 'Nota inválida',
      message: `Nota precisa ser um inteiro entre 1 e 5. Recebido: ${String(valor)}.`,
      statusCode: 422,
    })
  }
}

export class TituloInvalidoError extends DomainError {
  constructor(motivo: string) {
    super({
      code: 'avaliacao.titulo-invalido',
      title: 'Título inválido',
      message: motivo,
      statusCode: 422,
    })
  }
}

export class ComentarioInvalidoError extends DomainError {
  constructor(motivo: string) {
    super({
      code: 'avaliacao.comentario-invalido',
      title: 'Comentário inválido',
      message: motivo,
      statusCode: 422,
    })
  }
}

export class SetorInvalidoError extends DomainError {
  constructor(motivo: string) {
    super({
      code: 'avaliacao.setor-invalido',
      title: 'Setor inválido',
      message: motivo,
      statusCode: 422,
    })
  }
}

export class FuncionarioInativoError extends DomainError {
  constructor(codigoFun: string) {
    super({
      code: 'avaliacao.funcionario-inativo',
      title: 'Funcionário inativo',
      message: `Funcionário ${codigoFun} está desligado e não pode receber novas avaliações`,
      statusCode: 422,
    })
  }
}

// Autorização específica de domínio (403)
export class SetorNaoAutorizadoError extends DomainError {
  constructor(setorAvaliador: string, setorFuncionario: string, codigoFun: string) {
    super({
      code: 'avaliacao.setor-nao-autorizado',
      title: 'Funcionário fora do setor do avaliador',
      message: `O avaliador está vinculado ao setor '${setorAvaliador}'. O funcionário ${codigoFun} pertence ao setor '${setorFuncionario}'.`,
      statusCode: 403,
    })
  }
}

export class AvaliadorInativoError extends DomainError {
  constructor(id: string) {
    super({
      code: 'avaliacao.avaliador-inativo',
      title: 'Avaliador desativado',
      message: `Avaliador ${id} está desativado e não pode criar novas avaliações`,
      statusCode: 403,
    })
  }
}

export class EdicaoNaoAutorizadaError extends DomainError {
  constructor() {
    super({
      code: 'avaliacao.edicao-nao-autorizada',
      title: 'Edição não autorizada',
      message: 'Apenas o avaliador que criou a avaliação ou um ADMINISTRADOR pode editá-la',
      statusCode: 403,
    })
  }
}

// Conflitos (409)
export class AvaliadorJaExistenteError extends DomainError {
  constructor(usuarioId: string) {
    super({
      code: 'avaliacao.avaliador-ja-existe',
      title: 'Avaliador já existe',
      message: `Já existe um avaliador vinculado ao usuário ${usuarioId}`,
      statusCode: 409,
    })
  }
}
