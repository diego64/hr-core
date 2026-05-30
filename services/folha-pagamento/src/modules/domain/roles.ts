/**
 * Roles do HR Core, consumidas via claim `roles` do JWT emitido pelo Auth Service.
 * Cada role é um ESCOPO distinto (sem herança implícita): COORDENADOR não tem
 * automaticamente o que USUARIO tem — cada endpoint declara explicitamente
 * quem pode acessar.
 *
 * No ms-folha-pagamento:
 *   - USUARIO       : consulta próprio holerite e histórico de folhas.
 *   - COORDENADOR   : abre folha, lança verbas, processa cálculos, aprova/rejeita.
 *   - ADMINISTRADOR : tudo o que COORDENADOR pode + confirmar pagamento + fechar
 *                     definitivamente + estornar.
 *
 * Hierarquia: o doc da arquitetura prevê `ADMIN > COORD > USUARIO`. Aqui mantemos
 * escopos distintos por consistência com auth/funcionario/ferias — quando
 * ADMINISTRADOR precisa fazer o que COORDENADOR faz, o endpoint declara
 * `['COORDENADOR', 'ADMINISTRADOR']` no requireRole.
 */
export const ROLES = ['USUARIO', 'COORDENADOR', 'ADMINISTRADOR'] as const
export type Role = (typeof ROLES)[number]

export function isValidRole(value: string): value is Role {
  return (ROLES as readonly string[]).includes(value)
}
