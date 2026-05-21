import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'

import { ArquivoAusenteError, TipoDocumentoInvalidoError } from '../domain/errors/domain-error.js'
import type { DocumentoService } from '../services/documento.service.js'
import {
  aprovarPendentesResponseSchema,
  documentoDataResponseSchema,
  documentoListResponseSchema,
  idParamSchema,
  rejeitarBodySchema,
  tipoDocumentoSchema,
} from '../schemas/documento.schema.js'

/**
 * Routes plugin registrado SEM prefixo — as rotas usam o caminho completo
 * porque ficam aninhadas a `/funcionarios/:id/documentos`. Decisão deliberada:
 * deixa o controller fluente de ler, sem dependência implícita do registro.
 */
export function buildDocumentoRoutes(service: DocumentoService): FastifyPluginAsyncZod {
  return async (fastify) => {
    // ─── POST /funcionarios/:id/documentos (USUARIO, multipart) ──────────
    fastify.post(
      '/funcionarios/:id/documentos',
      {
        preHandler: [fastify.authenticate, fastify.requireRole('USUARIO')],
        schema: {
          tags: ['Documentos'],
          summary: 'Envia documento do funcionário (USUARIO, multipart/form-data)',
          description:
            'Aceita um único arquivo no campo "file" + campo "tipo" com um dos valores: ' +
            'RG, CPF, CTPS_DIGITAL, ASO_ADMISSIONAL, PIS, COMPROVANTE_ENDERECO. ' +
            'MIME types aceitos: application/pdf, image/jpeg, image/png. ' +
            'Tamanho máximo: 10 MB. ' +
            'Primeiro upload de um funcionário PENDENTE o transiciona para EM_VALIDACAO.',
          consumes: ['multipart/form-data'],
          params: idParamSchema,
          response: { 201: documentoDataResponseSchema },
        },
      },
      async (request, reply) => {
        // Itera por todas as parts — robusto à ordem (tipo antes ou depois
        // do arquivo). Multipart com mais de 1 arquivo é rejeitado pelo
        // limit registrado em app.ts.
        let buffer: Buffer | undefined
        let filename: string | undefined
        let mimetype: string | undefined
        let tipoRaw: unknown

        for await (const part of request.parts()) {
          if (part.type === 'file') {
            if (buffer) throw new ArquivoAusenteError()
            filename = part.filename
            mimetype = part.mimetype
            buffer = await part.toBuffer()
          } else if (part.fieldname === 'tipo') {
            tipoRaw = part.value
          }
        }

        if (!buffer || !filename || !mimetype) throw new ArquivoAusenteError()

        const tipoParsed = tipoDocumentoSchema.safeParse(tipoRaw)
        if (!tipoParsed.success) {
          // tipoRaw é `unknown` (vem do multipart) — só estringifica seguro
          // se já for string; objeto vira '<vazio>' pra evitar [object Object].
          const tipoLabel = typeof tipoRaw === 'string' && tipoRaw.length > 0 ? tipoRaw : '<vazio>'
          throw new TipoDocumentoInvalidoError(tipoLabel)
        }

        const doc = await service.upload({
          funcionarioId: request.params.id,
          tipo: tipoParsed.data,
          nomeOriginal: filename,
          mimeType: mimetype,
          conteudo: buffer,
          enviadoPor: request.user?.sub ?? 'desconhecido',
        })

        return reply.status(201).send({ data: doc })
      },
    )

    // ─── GET /funcionarios/:id/documentos (USUARIO ou COORDENADOR) ───────
    fastify.get(
      '/funcionarios/:id/documentos',
      {
        preHandler: [fastify.authenticate, fastify.requireRole(['USUARIO', 'COORDENADOR'])],
        schema: {
          tags: ['Documentos'],
          summary: 'Lista documentos enviados do funcionário (com downloadUrl assinada)',
          params: idParamSchema,
          response: { 200: documentoListResponseSchema },
        },
      },
      async (request) => {
        const docs = await service.listarPorFuncionario(request.params.id)
        return { data: docs }
      },
    )

    // ─── POST /funcionarios/:id/documentos/aprovar-pendentes (COORDENADOR) ─
    fastify.post(
      '/funcionarios/:id/documentos/aprovar-pendentes',
      {
        preHandler: [fastify.authenticate, fastify.requireRole('COORDENADOR')],
        schema: {
          tags: ['Documentos'],
          summary: 'Aprova em batch todos os documentos PENDENTES do funcionário (COORDENADOR)',
          description:
            'Atalho de produtividade: aprova todos os documentos PENDENTES de um funcionário ' +
            'numa única request. Recalcula score 1× no fim (vs N se cada doc fosse aprovado ' +
            'individualmente). Se eSocial completar (score=100 + asoValido + ctpsDigital), ' +
            'transita o funcionário automaticamente para ATIVO. Idempotente: chamar sem ' +
            'pendentes retorna `aprovados: 0`.',
          params: idParamSchema,
          response: { 200: aprovarPendentesResponseSchema },
        },
      },
      async (request) => {
        const sub = request.user?.sub ?? 'desconhecido'
        const resumo = await service.aprovarPendentesDoFuncionario(request.params.id, sub)
        return { data: resumo }
      },
    )

    // ─── POST /documentos/:id/aprovar (COORDENADOR) ──────────────────────
    fastify.post(
      '/documentos/:id/aprovar',
      {
        preHandler: [fastify.authenticate, fastify.requireRole('COORDENADOR')],
        schema: {
          tags: ['Documentos'],
          summary: 'Aprova documento PENDENTE (COORDENADOR)',
          description:
            'Marca o documento como APROVADO e recalcula a validação eSocial ' +
            'do funcionário. Quando score=100 + asoValido + ctpsDigital, o ' +
            'funcionário transita automaticamente de EM_VALIDACAO → APROVADO → ATIVO.',
          params: idParamSchema,
          response: { 200: documentoDataResponseSchema },
        },
      },
      async (request) => {
        const sub = request.user?.sub ?? 'desconhecido'
        const doc = await service.aprovar(request.params.id, sub)
        return { data: doc }
      },
    )

    // ─── POST /documentos/:id/rejeitar (COORDENADOR) ─────────────────────
    fastify.post(
      '/documentos/:id/rejeitar',
      {
        preHandler: [fastify.authenticate, fastify.requireRole('COORDENADOR')],
        schema: {
          tags: ['Documentos'],
          summary: 'Rejeita documento PENDENTE com motivo (COORDENADOR)',
          description:
            'Marca o documento como REJEITADO. O USUARIO pode re-enviar um ' +
            'documento do mesmo tipo. Score é recalculado.',
          params: idParamSchema,
          body: rejeitarBodySchema,
          response: { 200: documentoDataResponseSchema },
        },
      },
      async (request) => {
        const sub = request.user?.sub ?? 'desconhecido'
        const doc = await service.rejeitar(request.params.id, sub, request.body.motivo)
        return { data: doc }
      },
    )
  }
}
