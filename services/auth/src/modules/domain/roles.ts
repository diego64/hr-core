/**
 * Roles canônicos do HR Core. O array é a source-of-truth — usado por:
 *   - Zod schemas de validação
 *   - Seed inicial
 *   - Middleware RBAC (futuro)
 *
 * Convenção (responsabilidades por role — cada uma em um escopo distinto,
 * sem hierarquia de "tudo o que o de cima faz"):
 *
 *   - ADMINISTRADOR: **exclusivamente** CRUD de usuários no Auth Service
 *     (criar, desativar, alterar role, auditar). **Não** tem acesso a
 *     funcionalidades de domínio (funcionário, férias, avaliação, folha).
 *   - COORDENADOR: aprovações de fluxo (férias, documentos, alterações
 *     cadastrais) e leitura de relatórios da equipe. Consulta funcionários
 *     mas não cadastra.
 *   - USUARIO: operações de domínio do dia-a-dia — cadastra funcionários,
 *     solicita férias, sobe documentos. É o perfil operacional do RH.
 *   - AVALIADOR: criado pelo ADMINISTRADOR dentro do ms-avaliacao e vinculado
 *     a um setor. Avalia funcionários do próprio setor (título, comentário,
 *     nota 1-5). Sem acesso a outros domínios.
 *
 * O fluxo de autenticação (POST /auth/login) é idêntico para todos os roles;
 * o que muda é a autorização nos microsserviços downstream.
 */
export const ROLES = ['ADMINISTRADOR', 'COORDENADOR', 'USUARIO', 'AVALIADOR'] as const

export type Role = (typeof ROLES)[number]

export function isValidRole(value: string): value is Role {
  return (ROLES as readonly string[]).includes(value)
}
