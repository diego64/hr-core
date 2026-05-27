/**
 * Roles do HR Core, consumidas via claim `roles` do JWT emitido pelo Auth Service.
 * Cada role é um ESCOPO distinto (sem herança implícita): COORDENADOR não tem
 * automaticamente o que USUARIO tem — cada endpoint declara explicitamente
 * quem pode acessar.
 *
 * No ms-ferias:
 *   - USUARIO       : cria, cancela própria solicitação; consulta próprio histórico.
 *   - COORDENADOR   : aprova/rejeita solicitações; consulta histórico da equipe.
 *   - ADMINISTRADOR : pode tudo o que COORDENADOR pode + cancelar qualquer solicitação.
 *
 * Hierarquia: o doc da arquitetura prevê `ADMIN > COORD > USUARIO`. Aqui mantemos
 * escopos distintos por consistência com auth/funcionario — quando ADMINISTRADOR
 * precisa fazer o que COORDENADOR faz, o endpoint declara `['COORDENADOR', 'ADMINISTRADOR']`
 * no requireRole.
 */
export const ROLES = ['USUARIO', 'COORDENADOR', 'ADMINISTRADOR'] as const
export type Role = (typeof ROLES)[number]

export function isValidRole(value: string): value is Role {
  return (ROLES as readonly string[]).includes(value)
}
