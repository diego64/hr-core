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

export class CpfDuplicadoError extends DomainError {
  constructor(cpf: string) {
    super({
      code: 'cpf-duplicado',
      title: 'CPF já cadastrado',
      message: `O CPF ${cpf} já está em uso por outro funcionário`,
      statusCode: 409,
    })
  }
}

export class EmailDuplicadoError extends DomainError {
  constructor(email: string) {
    super({
      code: 'email-duplicado',
      title: 'E-mail já cadastrado',
      message: `O e-mail ${email} já está em uso por outro funcionário`,
      statusCode: 409,
    })
  }
}

export class FuncionarioNaoEncontradoError extends DomainError {
  constructor(id: string) {
    super({
      code: 'funcionario-nao-encontrado',
      title: 'Funcionário não encontrado',
      message: `Nenhum funcionário com identificador ${id}`,
      statusCode: 404,
    })
  }
}

export class FuncionarioJaDesligadoError extends DomainError {
  constructor() {
    super({
      code: 'funcionario-ja-desligado',
      title: 'Funcionário já desligado',
      message: 'Este funcionário já está com status DESLIGADO',
      statusCode: 409,
    })
  }
}

export class TransicaoInvalidaError extends DomainError {
  constructor(from: string, to: string) {
    super({
      code: 'transicao-invalida',
      title: 'Transição de status inválida',
      message: `Não é permitido transitar funcionário de ${from} para ${to}`,
      statusCode: 422,
    })
  }
}

export class DocumentoNaoEncontradoError extends DomainError {
  constructor(id: string) {
    super({
      code: 'documento-nao-encontrado',
      title: 'Documento não encontrado',
      message: `Nenhum documento com identificador ${id}`,
      statusCode: 404,
    })
  }
}

export class TipoDocumentoInvalidoError extends DomainError {
  constructor(tipo: string) {
    super({
      code: 'tipo-documento-invalido',
      title: 'Tipo de documento inválido',
      message: `Tipo de documento não reconhecido: ${tipo}`,
      statusCode: 422,
    })
  }
}

export class MimeTypeNaoSuportadoError extends DomainError {
  constructor(mime: string) {
    super({
      code: 'mime-type-nao-suportado',
      title: 'Tipo de arquivo não suportado',
      message: `MIME type não aceito: ${mime}. Use application/pdf, image/jpeg ou image/png`,
      statusCode: 422,
    })
  }
}

export class ArquivoMuitoGrandeError extends DomainError {
  constructor(tamanhoMaxBytes: number) {
    super({
      code: 'arquivo-muito-grande',
      title: 'Arquivo excede tamanho máximo',
      message: `O arquivo excede o limite de ${tamanhoMaxBytes} bytes`,
      statusCode: 413,
    })
  }
}

export class ArquivoAusenteError extends DomainError {
  constructor() {
    super({
      code: 'arquivo-ausente',
      title: 'Arquivo ausente',
      message: 'A requisição multipart precisa conter exatamente um arquivo no campo "file"',
      statusCode: 400,
    })
  }
}

export class DocumentoJaProcessadoError extends DomainError {
  constructor(status: string) {
    super({
      code: 'documento-ja-processado',
      title: 'Documento já processado',
      message: `Este documento já está no estado ${status} e não pode ser reprocessado`,
      statusCode: 409,
    })
  }
}

export class AprovacaoNaoEncontradaError extends DomainError {
  constructor(id: string) {
    super({
      code: 'aprovacao-nao-encontrada',
      title: 'Aprovação não encontrada',
      message: `Nenhuma aprovação com identificador ${id}`,
      statusCode: 404,
    })
  }
}

export class AprovacaoJaProcessadaError extends DomainError {
  constructor(status: string) {
    super({
      code: 'aprovacao-ja-processada',
      title: 'Aprovação já processada',
      message: `Esta aprovação já está no estado ${status} e não pode ser reprocessada`,
      statusCode: 409,
    })
  }
}

export class SemCamposParaAlterarError extends DomainError {
  constructor() {
    super({
      code: 'sem-campos-para-alterar',
      title: 'Nenhum campo informado',
      message: 'O payload precisa conter pelo menos um campo editável',
      statusCode: 422,
    })
  }
}

export class FuncionarioInaptoParaAlteracaoError extends DomainError {
  constructor(status: string) {
    super({
      code: 'funcionario-inapto-para-alteracao',
      title: 'Funcionário inapto para alteração',
      message: `Funcionário no estado ${status} não aceita alterações cadastrais`,
      statusCode: 409,
    })
  }
}
