import { randomUUID } from 'node:crypto'
import { ObjectId } from 'mongodb'

import {
  ArquivoMuitoGrandeError,
  DocumentoJaProcessadoError,
  DocumentoNaoEncontradoError,
  FuncionarioNaoEncontradoError,
  MimeTypeNaoSuportadoError,
} from '../domain/errors/domain-error.js'
import {
  toPublicDocumento,
  type PublicDocumento,
  type TipoDocumento,
} from '../domain/entities/documento.js'
import { calcularValidacaoESocial, passouValidacaoESocial } from '../domain/score.js'
import { validarTransicao } from '../domain/workflow/transicao-status.js'
import type { DocumentoRepository } from '../repositories/documento.repository.js'
import type { FuncionarioRepository } from '../repositories/funcionario.repository.js'

/** Tamanho máximo de upload por arquivo (10 MB). */
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024

/**
 * MIME types aceitos. RG/CPF/PIS geralmente são PDF (digital) ou foto da
 * carteira; ASO costuma ser PDF assinado; CTPS digital é PDF; comprovante
 * de endereço pode ser PDF ou foto. Lista intencionalmente restrita para
 * reduzir superfície de ataque (sem .docx, sem .zip, sem .svg).
 */
export const MIMES_ACEITOS: readonly string[] = ['application/pdf', 'image/jpeg', 'image/png']

const EXT_POR_MIME: Readonly<Record<string, string>> = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
}

export interface UploadDocumentoInput {
  readonly funcionarioId: string
  readonly tipo: TipoDocumento
  readonly nomeOriginal: string
  readonly mimeType: string
  readonly conteudo: Buffer
  readonly enviadoPor: string
}

export interface StoragePort {
  putObject(input: { key: string; body: Buffer; contentType: string }): Promise<void>
  getPresignedDownloadUrl(key: string): Promise<string>
}

export class DocumentoService {
  constructor(
    private readonly repo: DocumentoRepository,
    private readonly funcionarioRepo: FuncionarioRepository,
    private readonly storage: StoragePort,
  ) {}

  /**
   * Persiste o arquivo no storage, cria o registro PENDENTE e, se for o
   * primeiro documento do funcionário PENDENTE, transiciona para
   * EM_VALIDACAO (idempotente — se já está em outro estado, o status não
   * muda).
   */
  async upload(input: UploadDocumentoInput): Promise<PublicDocumento> {
    if (!MIMES_ACEITOS.includes(input.mimeType)) {
      throw new MimeTypeNaoSuportadoError(input.mimeType)
    }
    if (input.conteudo.byteLength > MAX_UPLOAD_BYTES) {
      throw new ArquivoMuitoGrandeError(MAX_UPLOAD_BYTES)
    }

    const funcionario = await this.funcionarioRepo.findById(input.funcionarioId)
    if (!funcionario) throw new FuncionarioNaoEncontradoError(input.funcionarioId)

    const funcionarioObjectId = funcionario._id
    const documentoId = new ObjectId()
    const extensao = EXT_POR_MIME[input.mimeType] ?? 'bin'
    // Inclui um UUID para evitar colisão se o mesmo documentoId aparecer
    // duas vezes (paranoia — ObjectId já é único, mas defesa em profundidade).
    const storageKey =
      `funcionarios/${funcionarioObjectId.toHexString()}` +
      `/${documentoId.toHexString()}-${randomUUID()}.${extensao}`

    await this.storage.putObject({
      key: storageKey,
      body: input.conteudo,
      contentType: input.mimeType,
    })

    const created = await this.repo.create({
      funcionarioId: funcionarioObjectId,
      tipo: input.tipo,
      storageKey,
      nomeOriginal: input.nomeOriginal,
      mimeType: input.mimeType,
      tamanhoBytes: input.conteudo.byteLength,
      enviadoPor: input.enviadoPor,
    })

    // Primeiro documento enviado: PENDENTE → EM_VALIDACAO. Se o funcionário
    // já está em EM_VALIDACAO/APROVADO/ATIVO/etc, atualizarStatus com filtro
    // `status: 'PENDENTE'` simplesmente retorna false (no-op), o que é o
    // comportamento desejado.
    if (funcionario.status === 'PENDENTE') {
      validarTransicao('PENDENTE', 'EM_VALIDACAO')
      await this.funcionarioRepo.atualizarStatus(funcionarioObjectId, 'PENDENTE', 'EM_VALIDACAO')
    }

    const downloadUrl = await this.storage.getPresignedDownloadUrl(storageKey)
    return toPublicDocumento(created, downloadUrl)
  }

  async listarPorFuncionario(funcionarioId: string): Promise<PublicDocumento[]> {
    const funcionario = await this.funcionarioRepo.findById(funcionarioId)
    if (!funcionario) throw new FuncionarioNaoEncontradoError(funcionarioId)

    const documentos = await this.repo.listByFuncionario(funcionario._id)
    return Promise.all(
      documentos.map(async (d) => {
        const url = await this.storage.getPresignedDownloadUrl(d.storageKey)
        return toPublicDocumento(d, url)
      }),
    )
  }

  /**
   * Carrega o documento + verifica que está PENDENTE (ainda processável).
   * Usado pelos endpoints aprovar/rejeitar antes de delegar para o repo.
   */
  async buscarParaProcessar(documentoId: string): Promise<{
    id: ObjectId
    funcionarioId: ObjectId
    statusAtual: 'PENDENTE'
  }> {
    const doc = await this.repo.findById(documentoId)
    if (!doc) throw new DocumentoNaoEncontradoError(documentoId)
    if (doc.status !== 'PENDENTE') throw new DocumentoJaProcessadoError(doc.status)
    return { id: doc._id, funcionarioId: doc.funcionarioId, statusAtual: 'PENDENTE' }
  }

  /**
   * COORDENADOR aprova um documento PENDENTE. Após persistir, recalcula
   * a validação eSocial do funcionário e, se completou todos os critérios
   * (score=100, asoValido, ctpsDigital), promove para ATIVO:
   *
   *   EM_VALIDACAO ──► APROVADO ──► ATIVO
   *
   * As duas transições rodam de seguida — APROVADO é estado intermediário
   * do workflow (não pular para preservar auditoria/logs). Concorrência:
   * `atualizarStatus(from, to)` filtra pelo status atual, então duas
   * aprovações simultâneas não duplicam o salto.
   */
  async aprovar(documentoId: string, aprovadoPor: string): Promise<PublicDocumento> {
    const alvo = await this.buscarParaProcessar(documentoId)
    const ok = await this.repo.aprovar(alvo.id, aprovadoPor)
    if (!ok) throw new DocumentoJaProcessadoError('APROVADO')

    await this.recalcularValidacaoEEventualPromocao(alvo.funcionarioId)
    return this.carregarPublicDocumento(alvo.id)
  }

  /**
   * COORDENADOR rejeita um documento PENDENTE com motivo. Documento sai do
   * cômputo do score; o funcionário NÃO é desclassificado automaticamente —
   * o USUARIO pode subir uma nova versão do mesmo tipo, e a aprovação da
   * nova zera o problema (a aggregate pega o mais recente APROVADO por tipo).
   *
   * Reprovação manual do funcionário inteiro (status REPROVADO) é caminho
   * separado — não implementado neste service.
   */
  async rejeitar(
    documentoId: string,
    aprovadoPor: string,
    motivo: string,
  ): Promise<PublicDocumento> {
    const alvo = await this.buscarParaProcessar(documentoId)
    const ok = await this.repo.rejeitar(alvo.id, aprovadoPor, motivo)
    if (!ok) throw new DocumentoJaProcessadoError('REJEITADO')

    // Score também recalcula em rejeição porque o doc deixou de existir
    // como pendente — relevante quando o usuário re-enviou e o coordenador
    // está limpando o duplicado.
    await this.recalcularValidacaoEEventualPromocao(alvo.funcionarioId)
    return this.carregarPublicDocumento(alvo.id)
  }

  /**
   * Aprova todos os documentos PENDENTES do funcionário em batch. Recalcula
   * score uma única vez no fim (vs N vezes se o coordenador clicasse em
   * cada doc individualmente). Se eSocial completar, transita ATIVO como
   * no fluxo individual.
   *
   * Idempotente do ponto de vista do caller: chamar 2x num funcionário sem
   * pendentes retorna `aprovados: 0` sem erro. Concorrência: 2 coordenadores
   * clicando ao mesmo tempo — cada doc só é aprovado por um (atomic update
   * com filtro status=PENDENTE); o `aprovados` final reflete só os que ESTE
   * caller venceu.
   */
  async aprovarPendentesDoFuncionario(
    funcionarioId: string,
    aprovadoPor: string,
  ): Promise<{
    funcionarioId: string
    aprovados: number
    score: number
    asoValido: boolean
    ctpsDigital: boolean
    statusFuncionario: string
  }> {
    const funcionario = await this.funcionarioRepo.findById(funcionarioId)
    if (!funcionario) throw new FuncionarioNaoEncontradoError(funcionarioId)

    const pendentes = await this.repo.listarPendentesDoFuncionario(funcionario._id)
    let aprovados = 0
    for (const doc of pendentes) {
      const venceu = await this.repo.aprovar(doc._id, aprovadoPor)
      if (venceu) aprovados++
    }

    // Recalcula sempre — mesmo se aprovados=0, queremos retornar o snapshot
    // atual (útil pro coordenador ver onde o funcionário está).
    await this.recalcularValidacaoEEventualPromocao(funcionario._id)

    // Re-carrega o snapshot final (score/flags/status já atualizados).
    const atualizado = await this.funcionarioRepo.findById(funcionario._id)
    return {
      funcionarioId: funcionario._id.toHexString(),
      aprovados,
      score: atualizado?.score ?? 0,
      asoValido: atualizado?.asoValido ?? false,
      ctpsDigital: atualizado?.ctpsDigital ?? false,
      statusFuncionario: atualizado?.status ?? funcionario.status,
    }
  }

  private async recalcularValidacaoEEventualPromocao(funcionarioId: ObjectId): Promise<void> {
    const aprovados = await this.repo.listarAprovadosPorTipo(funcionarioId)
    const validacao = calcularValidacaoESocial(aprovados)
    await this.funcionarioRepo.atualizarValidacao(funcionarioId, validacao)

    if (!passouValidacaoESocial(validacao)) return

    // Carrega status atual (após o atualizarValidacao acima) para decidir
    // se promove. Só promove se ainda está em EM_VALIDACAO — qualquer outro
    // estado (já ATIVO, REPROVADO, DESLIGADO) é no-op silencioso.
    const funcionario = await this.funcionarioRepo.findById(funcionarioId)
    if (!funcionario || funcionario.status !== 'EM_VALIDACAO') return

    validarTransicao('EM_VALIDACAO', 'APROVADO')
    const promovido = await this.funcionarioRepo.atualizarStatus(
      funcionarioId,
      'EM_VALIDACAO',
      'APROVADO',
    )
    if (!promovido) return // outro request promoveu primeiro

    validarTransicao('APROVADO', 'ATIVO')
    await this.funcionarioRepo.atualizarStatus(funcionarioId, 'APROVADO', 'ATIVO')
    // Fase 7 (Kafka): publicar `funcionario.created` aqui.
  }

  private async carregarPublicDocumento(id: ObjectId): Promise<PublicDocumento> {
    const doc = await this.repo.findById(id)
    if (!doc) throw new DocumentoNaoEncontradoError(id.toHexString())
    const url = await this.storage.getPresignedDownloadUrl(doc.storageKey)
    return toPublicDocumento(doc, url)
  }
}
