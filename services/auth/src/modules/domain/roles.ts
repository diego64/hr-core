/**
 * Roles canônicos do HR Core. O array é a source-of-truth — usado por:
 *   - Zod schemas de validação
 *   - Seed inicial
 *   - Middleware RBAC (futuro)
 *
 * Convenção (do mais alto privilégio para o mais baixo):
 *   - ADMINISTRADOR: executa CRUD em usuários e operações elevadas; pode
 *     desativar contas, alterar roles, ver auditoria.
 *   - COORDENADOR: permissões intermediárias — aprovações de fluxos
 *     (férias, ponto, avaliações), leitura ampliada de relatórios da equipe.
 *     Não tem CRUD de usuários.
 *   - USUARIO: operações de domínio do dia-a-dia (solicitar férias,
 *     consultar próprios dados, etc.). Permissões mínimas.
 *
 * O fluxo de autenticação (POST /auth/login) é idêntico para os 3 roles;
 * o que muda é a autorização nos microsserviços downstream.
 */
export const ROLES = ['ADMINISTRADOR', 'COORDENADOR', 'USUARIO'] as const

export type Role = (typeof ROLES)[number]

export function isValidRole(value: string): value is Role {
  return (ROLES as readonly string[]).includes(value)
}
