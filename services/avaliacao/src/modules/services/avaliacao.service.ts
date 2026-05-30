import { validarComentario, validarNota, validarTitulo } from '../domain/avaliacao-rules.js'
import {
  AvaliacaoNaoEncontradaError,
  AvaliadorInativoError,
  AvaliadorNaoEncontradoError,
  EdicaoNaoAutorizadaError,
  FuncionarioInativoError,
  FuncionarioNaoEncontradoError,
  SetorNaoAutorizadoError,
} from '../domain/errors/domain-error.js'
import {
  toAvaliacaoPublic,
  type AvaliacaoDocument,
  type AvaliacaoPublic,
} from '../domain/entities/avaliacao.js'
import { setoresIguais } from '../domain/value-objects/setor.js'
import { gerarCodigoAvaliacao } from '../domain/value-objects/codigo-avaliacao.js'
import type { EventPublisher } from '../../infrastructure/messaging/event-publisher.js'
import type {
  AvaliacaoRepository,
  ListarAvaliacoesFiltros,
} from '../repositories/avaliacao.repository.js'
import type { AvaliadorRepository } from '../repositories/avaliador.repository.js'
import type { ContadorRepository } from '../repositories/contador.repository.js'
import type { FuncionarioCacheRepository } from '../repositories/funcionario-cache.repository.js'
import type { AuditoriaService } from './auditoria.service.js'

export interface CriarAvaliacaoParams {
  readonly avaliadorUsuarioId: string
  readonly codigoFun: string
  readonly titulo: string
  readonly comentario: string
  readonly nota: number
  readonly ip: string | null
  readonly userAgent: string | null
}

export interface EditarAvaliacaoParams {
  readonly id: string
  readonly editorUsuarioId: string
  readonly editorEhAdmin: boolean
  readonly titulo?: string
  readonly comentario?: string
  readonly nota?: number
  readonly ip: string | null
  readonly userAgent: string | null
}

export interface ListarAvaliacoesParams {
  readonly filtros: ListarAvaliacoesFiltros
  readonly page: number
  readonly limit: number
}

export interface ListarAvaliacoesResponse {
  readonly items: AvaliacaoPublic[]
  readonly total: number
  readonly page: number
  readonly limit: number
  readonly pages: number
}

export class AvaliacaoService {
  constructor(
    private readonly repo: AvaliacaoRepository,
    private readonly avaliadorRepo: AvaliadorRepository,
    private readonly funcionarioCacheRepo: FuncionarioCacheRepository,
    private readonly contadorRepo: ContadorRepository,
    private readonly auditoria: AuditoriaService,
    private readonly events: EventPublisher,
  ) {}

  async buscarPorId(id: string): Promise<AvaliacaoPublic> {
    const doc = await this.repo.findById(id)
    if (!doc) throw new AvaliacaoNaoEncontradaError(id)
    return toAvaliacaoPublic(doc)
  }

  async buscarPorCodigo(codigo: string): Promise<AvaliacaoPublic> {
    const doc = await this.repo.findByCodigo(codigo)
    if (!doc) throw new AvaliacaoNaoEncontradaError(codigo)
    return toAvaliacaoPublic(doc)
  }

  async listar(params: ListarAvaliacoesParams): Promise<ListarAvaliacoesResponse> {
    const result = await this.repo.listar(params.filtros, params.page, params.limit)
    return {
      items: result.items.map(toAvaliacaoPublic),
      total: result.total,
      page: result.page,
      limit: result.limit,
      pages: result.pages,
    }
  }

  async criar(params: CriarAvaliacaoParams): Promise<AvaliacaoPublic> {
    // 1. Avaliador precisa existir e estar ativo
    const avaliador = await this.avaliadorRepo.findByUsuarioId(params.avaliadorUsuarioId)
    if (!avaliador) throw new AvaliadorNaoEncontradoError(params.avaliadorUsuarioId)
    if (!avaliador.ativo) throw new AvaliadorInativoError(avaliador._id.toHexString())

    // 2. Funcionário precisa existir no cache (sincronizado via Kafka/seed)
    const funcionario = await this.funcionarioCacheRepo.findByCodigoFun(params.codigoFun)
    if (!funcionario) throw new FuncionarioNaoEncontradoError(params.codigoFun)
    if (!funcionario.ativo) throw new FuncionarioInativoError(params.codigoFun)

    // 3. Setor do avaliador precisa bater com o setor do funcionário
    if (!setoresIguais(avaliador.setor, funcionario.setor)) {
      throw new SetorNaoAutorizadoError(avaliador.setor, funcionario.setor, params.codigoFun)
    }

    // 4. Validar payload
    const titulo = validarTitulo(params.titulo)
    const comentario = validarComentario(params.comentario)
    const nota = validarNota(params.nota)

    // 5. Gerar código sequencial AVAL
    const sequencia = await this.contadorRepo.proximoValor('AVAL')
    const codigo = gerarCodigoAvaliacao(sequencia)

    // 6. Persistir
    const doc = await this.repo.create({
      codigo,
      codigoFun: funcionario.codigoFun,
      funcionarioId: funcionario._id,
      avaliadorId: avaliador._id.toHexString(),
      setor: avaliador.setor,
      titulo,
      comentario,
      nota,
    })

    // 7. Auditoria + evento
    await this.auditoria.registrar({
      usuarioId: params.avaliadorUsuarioId,
      acao: 'AVALIACAO_CRIADA',
      recurso: 'avaliacoes',
      recursoId: doc._id.toHexString(),
      valorNovo: { codigo, codigoFun: doc.codigoFun, nota, titulo },
      ip: params.ip,
      userAgent: params.userAgent,
    })

    await this.events.publish({
      eventType: 'AvaliacaoCriada',
      aggregateId: doc._id.toHexString(),
      payload: {
        avaliacaoId: doc._id.toHexString(),
        codigo: doc.codigo,
        codigoFun: doc.codigoFun,
        avaliadorId: doc.avaliadorId,
        setor: doc.setor,
        nota: doc.nota,
      },
    })

    return toAvaliacaoPublic(doc)
  }

  async editar(params: EditarAvaliacaoParams): Promise<AvaliacaoPublic> {
    const anterior = await this.repo.findById(params.id)
    if (!anterior) throw new AvaliacaoNaoEncontradaError(params.id)

    // RBAC de domínio: AVALIADOR só edita as próprias; ADMIN edita qualquer.
    if (!params.editorEhAdmin) {
      const editor = await this.avaliadorRepo.findByUsuarioId(params.editorUsuarioId)
      if (!editor || editor._id.toHexString() !== anterior.avaliadorId) {
        throw new EdicaoNaoAutorizadaError()
      }
      if (!editor.ativo) {
        throw new AvaliadorInativoError(editor._id.toHexString())
      }
    }

    const updates: { titulo?: string; comentario?: string; nota?: AvaliacaoDocument['nota'] } = {}
    if (params.titulo !== undefined) updates.titulo = validarTitulo(params.titulo)
    if (params.comentario !== undefined) updates.comentario = validarComentario(params.comentario)
    if (params.nota !== undefined) updates.nota = validarNota(params.nota)

    const atualizado = await this.repo.update(params.id, updates)
    if (!atualizado) throw new AvaliacaoNaoEncontradaError(params.id)

    await this.auditoria.registrar({
      usuarioId: params.editorUsuarioId,
      acao: 'AVALIACAO_ATUALIZADA',
      recurso: 'avaliacoes',
      recursoId: params.id,
      valorAnterior: {
        titulo: anterior.titulo,
        comentario: anterior.comentario,
        nota: anterior.nota,
      },
      valorNovo: { ...updates },
      ip: params.ip,
      userAgent: params.userAgent,
    })

    await this.events.publish({
      eventType: 'AvaliacaoAtualizada',
      aggregateId: params.id,
      payload: {
        avaliacaoId: params.id,
        codigo: atualizado.codigo,
        camposAlterados: Object.keys(updates),
      },
    })

    return toAvaliacaoPublic(atualizado)
  }
}
