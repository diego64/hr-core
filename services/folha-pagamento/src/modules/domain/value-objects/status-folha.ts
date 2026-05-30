/**
 * Workflow da folha:
 *   ABERTA → PROCESSADA → APROVADA → PAGA → FECHADA
 *                  ↓
 *              REJEITADA → ABERTA (reprocessamento)
 *
 * - ABERTA   : recém-criada, aceita lançamento de verbas
 * - PROCESSADA : cálculos executados, aguardando aprovação
 * - APROVADA : aprovada pelo COORDENADOR ou ADMINISTRADOR
 * - PAGA     : pagamento confirmado
 * - FECHADA  : encerrada definitivamente, imutável
 * - REJEITADA: rejeitada com justificativa — retorna pra ABERTA quando
 *              service.abrirReprocessamento() é chamado
 */
export const STATUS_FOLHA = [
  'ABERTA',
  'PROCESSADA',
  'APROVADA',
  'PAGA',
  'FECHADA',
  'REJEITADA',
] as const
export type StatusFolha = (typeof STATUS_FOLHA)[number]

export function isStatusFolha(value: string): value is StatusFolha {
  return (STATUS_FOLHA as readonly string[]).includes(value)
}
