import { describe, expect, it } from 'vitest'

import { FakeAuditoriaRepository } from '../../../test/fakes.js'
import type { AuditoriaRepository } from '../repositories/auditoria.repository.js'
import { AuditoriaService } from './auditoria.service.js'

function buildService(): { service: AuditoriaService; repo: FakeAuditoriaRepository } {
  const repo = new FakeAuditoriaRepository()
  const service = new AuditoriaService(repo as unknown as AuditoriaRepository)
  return { service, repo }
}

describe('AuditoriaService', () => {
  it('registra com defaults null pra ip/userAgent quando omitidos', async () => {
    const { service, repo } = buildService()

    await service.registrar({
      usuarioId: 'usuario-1',
      acao: 'FERIAS_SOLICITADAS',
      recurso: 'solicitacoes_ferias',
      recursoId: 'sol-1',
      valorAnterior: null,
      valorNovo: { status: 'PENDENTE' },
    })

    expect(repo.docs).toHaveLength(1)
    const [doc] = repo.docs
    expect(doc).toMatchObject({
      usuarioId: 'usuario-1',
      acao: 'FERIAS_SOLICITADAS',
      recurso: 'solicitacoes_ferias',
      recursoId: 'sol-1',
      valorAnterior: null,
      valorNovo: { status: 'PENDENTE' },
      ip: null,
      userAgent: null,
    })
  })

  it('aceita usuarioId null em ações automáticas de job', async () => {
    const { service, repo } = buildService()

    await service.registrar({
      usuarioId: null,
      acao: 'GOZO_INICIADO',
      recurso: 'periodos_gozo',
      recursoId: 'gozo-1',
    })

    const [doc] = repo.docs
    expect(doc!.usuarioId).toBeNull()
    expect(doc!.valorAnterior).toBeNull()
    expect(doc!.valorNovo).toBeNull()
  })

  it('preserva ip e userAgent quando informados pelo middleware HTTP', async () => {
    const { service, repo } = buildService()

    await service.registrar({
      usuarioId: 'usuario-1',
      acao: 'FERIAS_APROVADAS',
      recurso: 'solicitacoes_ferias',
      recursoId: 'sol-2',
      ip: '10.0.0.1',
      userAgent: 'CustomAgent/1.0',
    })

    const [doc] = repo.docs
    expect(doc!.ip).toBe('10.0.0.1')
    expect(doc!.userAgent).toBe('CustomAgent/1.0')
  })
})
