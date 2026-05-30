import type { TipoItem } from './entities/folha.js'

/**
 * Catálogo de verbas reconhecidas pelo serviço. Códigos seguem a tabela do
 * spec da arquitetura. Verbas automáticas (`auto: true`) são injetadas pelo
 * processamento — não podem ser lançadas manualmente:
 *
 *   - 001 Salário base : adicionado por `processarFolha()` a partir do cache
 *   - 101 INSS         : calculado por `calcularINSS()`
 *   - 102 IRRF         : calculado por `calcularIRRF()`
 */
export interface VerbaCatalogada {
  readonly codigo: string
  readonly descricao: string
  readonly tipo: TipoItem
  readonly auto: boolean // injetada automaticamente pelo cálculo
}

export const VERBAS_CATALOGO: Readonly<Record<string, VerbaCatalogada>> = {
  // Proventos
  '001': { codigo: '001', descricao: 'Salário base', tipo: 'PROVENTO', auto: true },
  '002': { codigo: '002', descricao: 'Hora extra 50%', tipo: 'PROVENTO', auto: false },
  '003': { codigo: '003', descricao: 'Hora extra 100%', tipo: 'PROVENTO', auto: false },
  '004': { codigo: '004', descricao: 'Adicional noturno', tipo: 'PROVENTO', auto: false },
  '005': { codigo: '005', descricao: 'Adicional de insalubridade', tipo: 'PROVENTO', auto: false },
  '006': { codigo: '006', descricao: 'Adicional de periculosidade', tipo: 'PROVENTO', auto: false },
  '007': {
    codigo: '007',
    descricao: 'Adiantamento 13º (1ª parcela)',
    tipo: 'PROVENTO',
    auto: false,
  },
  '008': { codigo: '008', descricao: '13º salário (2ª parcela)', tipo: 'PROVENTO', auto: false },
  '009': {
    codigo: '009',
    descricao: 'Férias (integração ms-ferias)',
    tipo: 'PROVENTO',
    auto: true,
  },

  // Descontos
  '101': { codigo: '101', descricao: 'INSS', tipo: 'DESCONTO', auto: true },
  '102': { codigo: '102', descricao: 'IRRF', tipo: 'DESCONTO', auto: true },
  '103': { codigo: '103', descricao: 'Vale transporte', tipo: 'DESCONTO', auto: false },
  '104': { codigo: '104', descricao: 'Vale refeição', tipo: 'DESCONTO', auto: false },
  '105': { codigo: '105', descricao: 'Plano de saúde', tipo: 'DESCONTO', auto: false },
  '106': { codigo: '106', descricao: 'Falta injustificada', tipo: 'DESCONTO', auto: false },
  '107': { codigo: '107', descricao: 'Atraso', tipo: 'DESCONTO', auto: false },
}

export function isVerbaConhecida(codigo: string): boolean {
  return codigo in VERBAS_CATALOGO
}

export function isVerbaAutomatica(codigo: string): boolean {
  return VERBAS_CATALOGO[codigo]?.auto === true
}

export function descricaoDaVerba(codigo: string): string | null {
  return VERBAS_CATALOGO[codigo]?.descricao ?? null
}

export function tipoDaVerba(codigo: string): TipoItem | null {
  return VERBAS_CATALOGO[codigo]?.tipo ?? null
}
