import type { ItemFolha } from './entities/folha.js'
import { calcularFGTS } from './calculo-fgts.js'
import { calcularINSS } from './calculo-inss.js'
import { calcularIRRF } from './calculo-irrf.js'

/**
 * Cálculo orquestrador da folha. Recebe a folha com lançamentos manuais
 * (proventos variáveis e descontos variáveis), aplica INSS/IRRF/FGTS e
 * retorna o pacote completo de valores calculados.
 *
 * Fluxo:
 *   SalarioBruto   = SalarioBase + ProventosVariaveis (exceto código '001')
 *   BaseINSS       = SalarioBruto
 *   DescontoINSS   = calcularINSS(BaseINSS)
 *   BaseIRRF       = SalarioBruto - DescontoINSS
 *   DescontoIRRF   = calcularIRRF(BaseIRRF, numeroDependentes)
 *   TotalDescontos = DescontoINSS + DescontoIRRF + DescontosVariáveis
 *   SalarioLiquido = SalarioBruto - TotalDescontos
 *   FGTS           = SalarioBruto * 0,08  (encargo patronal)
 *
 * O código '001' (Salário base) é injetado automaticamente nos proventos
 * pelo cálculo, então não precisa ser lançado manualmente.
 */
const CENTAVOS_FACTOR = 100

function arredondar2(valor: number): number {
  return Math.round(valor * CENTAVOS_FACTOR) / CENTAVOS_FACTOR
}

export interface ProcessarFolhaInput {
  readonly salarioBase: number
  readonly numeroDependentes: number
  readonly proventos: readonly ItemFolha[] // lançados manualmente (sem o código '001')
  readonly descontos: readonly ItemFolha[] // lançados manualmente (sem INSS '101' e IRRF '102')
}

export interface ProcessarFolhaOutput {
  readonly proventos: readonly ItemFolha[]
  readonly descontos: readonly ItemFolha[]
  readonly totalProventos: number
  readonly totalDescontos: number
  readonly salarioBruto: number
  readonly salarioLiquido: number
  readonly descontoINSS: number
  readonly descontoIRRF: number
  readonly fgts: number
}

const CODIGO_SALARIO_BASE = '001'
const CODIGO_INSS = '101'
const CODIGO_IRRF = '102'

export function processarFolha(input: ProcessarFolhaInput): ProcessarFolhaOutput {
  const { salarioBase, numeroDependentes } = input
  if (salarioBase < 0) throw new Error('salarioBase não pode ser negativo')
  if (numeroDependentes < 0) throw new Error('numeroDependentes não pode ser negativo')

  // Salário base entra como provento '001' — descartamos qualquer '001' manual
  // para evitar duplicação acidental ao reprocessar.
  const proventosVariaveis = input.proventos.filter((p) => p.codigo !== CODIGO_SALARIO_BASE)
  const itemSalarioBase: ItemFolha = {
    codigo: CODIGO_SALARIO_BASE,
    descricao: 'Salário base',
    tipo: 'PROVENTO',
    valor: arredondar2(salarioBase),
  }

  const proventos = [itemSalarioBase, ...proventosVariaveis]
  const salarioBruto = arredondar2(proventos.reduce((sum, p) => sum + p.valor, 0))

  // INSS sobre o bruto; IRRF sobre (bruto - INSS), descontando R$ 189,59 por dep.
  const descontoINSS = calcularINSS(salarioBruto)
  const baseIRRF = arredondar2(salarioBruto - descontoINSS)
  const descontoIRRF = calcularIRRF({ baseCalculo: baseIRRF, numeroDependentes })

  // Reaplica INSS/IRRF sempre — se o usuário lançou manualmente, ignoramos
  // (apenas o cálculo automático é fonte da verdade).
  const descontosVariaveis = input.descontos.filter(
    (d) => d.codigo !== CODIGO_INSS && d.codigo !== CODIGO_IRRF,
  )

  const itemINSS: ItemFolha = {
    codigo: CODIGO_INSS,
    descricao: 'INSS',
    tipo: 'DESCONTO',
    valor: descontoINSS,
  }
  const itemIRRF: ItemFolha = {
    codigo: CODIGO_IRRF,
    descricao: 'IRRF',
    tipo: 'DESCONTO',
    valor: descontoIRRF,
  }
  const descontos = [itemINSS, itemIRRF, ...descontosVariaveis]

  const totalProventos = arredondar2(proventos.reduce((sum, p) => sum + p.valor, 0))
  const totalDescontos = arredondar2(descontos.reduce((sum, d) => sum + d.valor, 0))
  const salarioLiquido = arredondar2(totalProventos - totalDescontos)
  const fgts = calcularFGTS(salarioBruto)

  return {
    proventos,
    descontos,
    totalProventos,
    totalDescontos,
    salarioBruto: totalProventos,
    salarioLiquido,
    descontoINSS,
    descontoIRRF,
    fgts,
  }
}
