/**
 * Snapshot local do funcionário recebido via Kafka (`FuncionarioCriado`,
 * `FuncionarioAtualizado`, `FuncionarioDesligado`).
 *
 * Por que: o ms-avaliacao precisa validar se o setor do funcionário bate com
 * o setor do avaliador. Em vez de chamada HTTP síncrona no fluxo de criar
 * avaliação (acoplamento + latência), espelhamos o estado do funcionário
 * localmente. A fonte da verdade continua sendo o ms-funcionario.
 *
 * Enquanto a integração Kafka real não sobe, o seed popula este cache
 * manualmente e o ms-avaliacao tolera funcionários ausentes (rejeita com 404).
 */
export interface FuncionarioCacheDocument {
  readonly _id: string
  readonly codigoFun: string
  readonly nome: string
  readonly setor: string
  readonly ativo: boolean
  readonly updatedAt: Date
}
