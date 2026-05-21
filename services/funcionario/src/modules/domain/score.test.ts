import { ObjectId } from 'mongodb'
import { describe, expect, it } from 'vitest'

import type { Documento, TipoDocumento } from './entities/documento.js'
import {
  DOCUMENTO_PESOS,
  SCORE_TOTAL,
  calcularValidacaoESocial,
  passouValidacaoESocial,
} from './score.js'

function aprovado(tipo: TipoDocumento, overrides: Partial<Documento> = {}): Documento {
  const id = new ObjectId()
  const now = new Date()
  return {
    _id: id,
    funcionarioId: new ObjectId(),
    tipo,
    status: 'APROVADO',
    storageKey: `k/${id.toHexString()}`,
    nomeOriginal: 'x.pdf',
    mimeType: 'application/pdf',
    tamanhoBytes: 1,
    enviadoPor: 'u',
    enviadoEm: now,
    aprovadoPor: 'c',
    aprovadoEm: now,
    motivoRejeicao: null,
    updatedAt: now,
    ...overrides,
  }
}

describe('domain/score', () => {
  describe('DOCUMENTO_PESOS', () => {
    it('soma dos pesos = 100 (invariante crítico)', () => {
      expect(SCORE_TOTAL).toBe(100)
    })

    it('cobre todos os 6 tipos esperados', () => {
      expect(Object.keys(DOCUMENTO_PESOS).sort()).toEqual([
        'ASO_ADMISSIONAL',
        'COMPROVANTE_ENDERECO',
        'CPF',
        'CTPS_DIGITAL',
        'PIS',
        'RG',
      ])
    })
  })

  describe('calcularValidacaoESocial', () => {
    it('zero documentos → score 0, asoValido false, ctpsDigital false', () => {
      const v = calcularValidacaoESocial([])
      expect(v).toEqual({ score: 0, asoValido: false, ctpsDigital: false })
    })

    it('apenas RG aprovado → score 10', () => {
      expect(calcularValidacaoESocial([aprovado('RG')]).score).toBe(10)
    })

    it('todos os 6 tipos aprovados → score 100, asoValido true, ctpsDigital true', () => {
      const docs = (
        ['RG', 'CPF', 'CTPS_DIGITAL', 'ASO_ADMISSIONAL', 'PIS', 'COMPROVANTE_ENDERECO'] as const
      ).map((t) => aprovado(t))
      expect(calcularValidacaoESocial(docs)).toEqual({
        score: 100,
        asoValido: true,
        ctpsDigital: true,
      })
    })

    it('cinco aprovados, ASO faltando → score 70, asoValido false', () => {
      const docs = (['RG', 'CPF', 'CTPS_DIGITAL', 'PIS', 'COMPROVANTE_ENDERECO'] as const).map(
        (t) => aprovado(t),
      )
      const v = calcularValidacaoESocial(docs)
      expect(v.score).toBe(70)
      expect(v.asoValido).toBe(false)
      expect(v.ctpsDigital).toBe(true)
    })

    it('cinco aprovados, CTPS faltando → score 80, ctpsDigital false', () => {
      const docs = (['RG', 'CPF', 'ASO_ADMISSIONAL', 'PIS', 'COMPROVANTE_ENDERECO'] as const).map(
        (t) => aprovado(t),
      )
      const v = calcularValidacaoESocial(docs)
      expect(v.score).toBe(80)
      expect(v.asoValido).toBe(true)
      expect(v.ctpsDigital).toBe(false)
    })

    it('ignora documentos com status PENDENTE ou REJEITADO', () => {
      const docs = [
        aprovado('RG'),
        aprovado('CPF', { status: 'PENDENTE' }),
        aprovado('PIS', { status: 'REJEITADO' }),
      ]
      const v = calcularValidacaoESocial(docs)
      expect(v.score).toBe(10) // só o RG conta
    })

    it('deduplica por tipo (paranoia — caller já deve passar único por tipo)', () => {
      const docs = [aprovado('RG'), aprovado('RG'), aprovado('CPF')]
      expect(calcularValidacaoESocial(docs).score).toBe(20)
    })
  })

  describe('passouValidacaoESocial', () => {
    it('true apenas quando score=100 + asoValido + ctpsDigital', () => {
      expect(passouValidacaoESocial({ score: 100, asoValido: true, ctpsDigital: true })).toBe(true)
    })

    it.each([
      [{ score: 99, asoValido: true, ctpsDigital: true }],
      [{ score: 100, asoValido: false, ctpsDigital: true }],
      [{ score: 100, asoValido: true, ctpsDigital: false }],
      [{ score: 0, asoValido: false, ctpsDigital: false }],
    ])('false em %j', (v) => {
      expect(passouValidacaoESocial(v)).toBe(false)
    })
  })
})
