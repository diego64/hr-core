/**
 * Roles canônicos do HR Core. Source-of-truth está no auth-service; aqui
 * declaramos o mesmo conjunto para validações locais (RBAC do middleware
 * authenticate e Zod nas rotas do serviço).
 *
 * Convenção de acesso ao Funcionario Service:
 *   - USUARIO: cadastra, lista, consulta e desliga funcionários (ciclo
 *     operacional do RH). É o único que cria registros no serviço.
 *   - COORDENADOR: lista e consulta para revisar aprovações de fluxos
 *     (férias, alterações cadastrais, documentos) em outros serviços.
 *   - ADMINISTRADOR: **sem acesso** ao Funcionario Service. Responsável
 *     apenas pelo CRUD de usuários no Auth Service.
 *
 * Observação: aprovações (de documentos, alterações etc.) são fluxo do
 * COORDENADOR e vivem em endpoints próprios — fora do escopo da V1 deste
 * serviço.
 */
export const ROLES = ['ADMINISTRADOR', 'COORDENADOR', 'USUARIO'] as const

export type Role = (typeof ROLES)[number]

export function isValidRole(value: string): value is Role {
  return (ROLES as readonly string[]).includes(value)
}
