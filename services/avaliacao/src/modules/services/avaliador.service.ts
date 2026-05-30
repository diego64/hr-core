import {
  AvaliadorJaExistenteError,
  AvaliadorNaoEncontradoError,
} from '../domain/errors/domain-error.js'
import {
  toAvaliadorPublic,
  type AvaliadorDocument,
  type AvaliadorPublic,
} from '../domain/entities/avaliador.js'
import { normalizarSetor } from '../domain/value-objects/setor.js'
import type {
  AvaliadorRepository,
  CreateAvaliadorInput,
} from '../repositories/avaliador.repository.js'
import type { EventPublisher } from '../../infrastructure/messaging/event-publisher.js'
import type { AuditoriaService } from './auditoria.service.js'

export interface CriarAvaliadorParams {
  readonly usuarioId: string
  readonly nome: string
  readonly email: string
  readonly setor: string
  readonly criadoPor: string
  readonly ip: string | null
  readonly userAgent: string | null
}

export interface DesativarAvaliadorParams {
  readonly id: string
  readonly desativadoPor: string
  readonly ip: string | null
  readonly userAgent: string | null
}

export class AvaliadorService {
  constructor(
    private readonly repo: AvaliadorRepository,
    private readonly auditoria: AuditoriaService,
    private readonly events: EventPublisher,
  ) {}

  async listar(filtros: { setor?: string; ativo?: boolean }): Promise<AvaliadorPublic[]> {
    const docs = await this.repo.list(filtros)
    return docs.map(toAvaliadorPublic)
  }

  async buscarPorId(id: string): Promise<AvaliadorPublic> {
    const doc = await this.repo.findById(id)
    if (!doc) throw new AvaliadorNaoEncontradoError(id)
    return toAvaliadorPublic(doc)
  }

  async buscarDocPorUsuarioId(usuarioId: string): Promise<AvaliadorDocument | null> {
    return this.repo.findByUsuarioId(usuarioId)
  }

  async criar(params: CriarAvaliadorParams): Promise<AvaliadorPublic> {
    const setorNormalizado = normalizarSetor(params.setor)
    const existente = await this.repo.findByUsuarioId(params.usuarioId)
    if (existente) throw new AvaliadorJaExistenteError(params.usuarioId)

    const input: CreateAvaliadorInput = {
      usuarioId: params.usuarioId,
      nome: params.nome.trim(),
      email: params.email.trim().toLowerCase(),
      setor: setorNormalizado,
      criadoPor: params.criadoPor,
    }
    const doc = await this.repo.create(input)

    await this.auditoria.registrar({
      usuarioId: params.criadoPor,
      acao: 'AVALIADOR_CRIADO',
      recurso: 'avaliadores',
      recursoId: doc._id.toHexString(),
      valorNovo: { usuarioId: doc.usuarioId, setor: doc.setor },
      ip: params.ip,
      userAgent: params.userAgent,
    })

    await this.events.publish({
      eventType: 'AvaliadorCriado',
      aggregateId: doc._id.toHexString(),
      payload: {
        avaliadorId: doc._id.toHexString(),
        usuarioId: doc.usuarioId,
        setor: doc.setor,
      },
    })

    return toAvaliadorPublic(doc)
  }

  async desativar(params: DesativarAvaliadorParams): Promise<AvaliadorPublic> {
    const anterior = await this.repo.findById(params.id)
    if (!anterior) throw new AvaliadorNaoEncontradoError(params.id)

    const atualizado = await this.repo.desativar(params.id)
    if (!atualizado) throw new AvaliadorNaoEncontradoError(params.id)

    await this.auditoria.registrar({
      usuarioId: params.desativadoPor,
      acao: 'AVALIADOR_DESATIVADO',
      recurso: 'avaliadores',
      recursoId: params.id,
      valorAnterior: { ativo: anterior.ativo },
      valorNovo: { ativo: false },
      ip: params.ip,
      userAgent: params.userAgent,
    })

    await this.events.publish({
      eventType: 'AvaliadorDesativado',
      aggregateId: params.id,
      payload: { avaliadorId: params.id, usuarioId: atualizado.usuarioId },
    })

    return toAvaliadorPublic(atualizado)
  }
}
