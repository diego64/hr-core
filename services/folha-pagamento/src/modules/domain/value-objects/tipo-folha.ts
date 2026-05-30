export const TIPOS_FOLHA = [
  'MENSAL',
  'ADIANTAMENTO',
  'DECIMO_TERCEIRO_PRIMEIRA',
  'DECIMO_TERCEIRO_SEGUNDA',
  'FERIAS',
] as const
export type TipoFolha = (typeof TIPOS_FOLHA)[number]

export function isTipoFolha(value: string): value is TipoFolha {
  return (TIPOS_FOLHA as readonly string[]).includes(value)
}
