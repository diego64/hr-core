import { CompetenciaInvalidaError } from '../errors/domain-error.js'
import type { TipoFolha } from './tipo-folha.js'

/**
 * Competência da folha.
 *   - MENSAL/ADIANTAMENTO/FERIAS: AAAA-MM (ex.: "2026-05")
 *   - DECIMO_TERCEIRO_PRIMEIRA/SEGUNDA: AAAA (ex.: "2026")
 *
 * Validação estrita para evitar inconsistência entre tipo da folha e formato
 * da competência — facilita filtros, dashboards e cálculo de FGTS por mês.
 */
const RE_AAAA_MM = /^\d{4}-(0[1-9]|1[0-2])$/
const RE_AAAA = /^\d{4}$/

const ANO_MINIMO = 1900
const ANO_MAXIMO = 2999

function tipoExigeMes(tipo: TipoFolha): boolean {
  return tipo === 'MENSAL' || tipo === 'ADIANTAMENTO' || tipo === 'FERIAS'
}

function anoEntreLimites(ano: number): boolean {
  return ano >= ANO_MINIMO && ano <= ANO_MAXIMO
}

export function validarCompetencia(competencia: string, tipo: TipoFolha): void {
  if (tipoExigeMes(tipo)) {
    if (!RE_AAAA_MM.test(competencia)) throw new CompetenciaInvalidaError(competencia, tipo)
    const ano = Number(competencia.slice(0, 4))
    if (!anoEntreLimites(ano)) throw new CompetenciaInvalidaError(competencia, tipo)
    return
  }

  // 13º — só ano
  if (!RE_AAAA.test(competencia)) throw new CompetenciaInvalidaError(competencia, tipo)
  const ano = Number(competencia)
  if (!anoEntreLimites(ano)) throw new CompetenciaInvalidaError(competencia, tipo)
}
