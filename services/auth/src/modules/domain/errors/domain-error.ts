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

export class EmailAlreadyTakenError extends DomainError {
  constructor(email: string) {
    super({
      code: 'email-already-taken',
      title: 'Email already taken',
      message: `Email already registered: ${email}`,
      statusCode: 409,
    })
  }
}

export class InvalidCredentialsError extends DomainError {
  constructor() {
    super({
      code: 'invalid-credentials',
      title: 'Invalid credentials',
      // Mensagem genérica para não vazar se o e-mail existe — mitigação de
      // enumeração de usuários.
      message: 'Invalid email or password',
      statusCode: 401,
    })
  }
}

export class UserDisabledError extends DomainError {
  constructor() {
    super({
      code: 'user-disabled',
      title: 'User disabled',
      message: 'This user account is disabled',
      statusCode: 403,
    })
  }
}

export class InvalidRefreshTokenError extends DomainError {
  constructor() {
    super({
      code: 'invalid-refresh-token',
      title: 'Invalid refresh token',
      message: 'Refresh token is invalid, expired or reused',
      statusCode: 401,
    })
  }
}

export class RefreshTokenReuseDetectedError extends DomainError {
  constructor() {
    super({
      code: 'refresh-token-reuse-detected',
      title: 'Refresh token reuse detected',
      // Acionado quando um token já consumido é reapresentado — toda a cadeia
      // do usuário é revogada (defesa contra exfiltração).
      message: 'Refresh token reuse detected — all sessions for this user have been revoked',
      statusCode: 401,
    })
  }
}
