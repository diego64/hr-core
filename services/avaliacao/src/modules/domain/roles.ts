/**
 * Roles do HR Core, consumidas via claim `roles` do JWT emitido pelo Auth Service.
 *
 * No ms-avaliacao:
 *   - USUARIO       : consulta as próprias avaliações recebidas.
 *   - AVALIADOR     : criado pelo ADMINISTRADOR e vinculado a um setor.
 *                     Cria e edita avaliações dos funcionários do próprio setor.
 *   - COORDENADOR   : visualiza avaliações do próprio setor (leitura).
 *   - ADMINISTRADOR : acesso total — cria/desativa avaliadores, edita qualquer
 *                     avaliação, visualiza todos os setores.
 */
export const ROLES = ['USUARIO', 'AVALIADOR', 'COORDENADOR', 'ADMINISTRADOR'] as const
export type Role = (typeof ROLES)[number]

export function isValidRole(value: string): value is Role {
  return (ROLES as readonly string[]).includes(value)
}
