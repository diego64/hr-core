import { describe, expect, it } from 'vitest'

import { CompetenciaInvalidaError } from '../errors/domain-error.js'
import { validarCompetencia } from './competencia.js'

describe('domain/competencia', () => {
  describe('tipos mensais (MENSAL, ADIANTAMENTO, FERIAS) exigem AAAA-MM', () => {
    it('aceita formato válido', () => {
      expect(() => validarCompetencia('2026-05', 'MENSAL')).not.toThrow()
      expect(() => validarCompetencia('2026-12', 'ADIANTAMENTO')).not.toThrow()
      expect(() => validarCompetencia('2024-01', 'FERIAS')).not.toThrow()
    })

    it('rejeita formato apenas com ano', () => {
      expect(() => validarCompetencia('2026', 'MENSAL')).toThrow(CompetenciaInvalidaError)
    })

    it('rejeita mês inválido (00 ou 13)', () => {
      expect(() => validarCompetencia('2026-00', 'MENSAL')).toThrow(CompetenciaInvalidaError)
      expect(() => validarCompetencia('2026-13', 'MENSAL')).toThrow(CompetenciaInvalidaError)
    })
  })

  describe('tipos anuais (DECIMO_TERCEIRO_*) exigem AAAA', () => {
    it('aceita apenas ano', () => {
      expect(() => validarCompetencia('2026', 'DECIMO_TERCEIRO_PRIMEIRA')).not.toThrow()
      expect(() => validarCompetencia('2026', 'DECIMO_TERCEIRO_SEGUNDA')).not.toThrow()
    })

    it('rejeita formato com mês', () => {
      expect(() => validarCompetencia('2026-11', 'DECIMO_TERCEIRO_PRIMEIRA')).toThrow(
        CompetenciaInvalidaError,
      )
    })
  })

  it('rejeita ano fora do intervalo razoável', () => {
    expect(() => validarCompetencia('1800-05', 'MENSAL')).toThrow(CompetenciaInvalidaError)
    expect(() => validarCompetencia('3000-05', 'MENSAL')).toThrow(CompetenciaInvalidaError)
  })
})
