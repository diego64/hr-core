/**
 * Mocka @aws-sdk/client-s3 e @aws-sdk/s3-request-presigner — o objetivo
 * é validar:
 *   - ensureBucket: HEAD ok → no-op; HEAD 404 → CREATE; HEAD com outro
 *     erro → propaga.
 *   - putObject / deleteObject: comandos corretos com Bucket+Key+ContentType.
 *   - getPresignedDownloadUrl: usa o presigner client (com S3_PUBLIC_ENDPOINT
 *     quando definido), retorna a URL assinada.
 *
 * A camada real é exercitada na E2E (Fase 6) contra um MinIO de verdade.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const sendMock = vi.fn()

class FakeCmd {
  constructor(public readonly input: Record<string, unknown>) {}
}

// Construtor mockado — precisa ser `function` (não arrow) para suportar `new`.
function FakeS3Client(this: Record<string, unknown>, cfg: Record<string, unknown>): void {
  this.config = cfg
  this.send = sendMock
  this.destroy = vi.fn()
}

vi.mock('@aws-sdk/client-s3', () => ({
  S3Client: FakeS3Client,
  HeadBucketCommand: class extends FakeCmd {
    readonly _kind = 'HeadBucket'
  },
  CreateBucketCommand: class extends FakeCmd {
    readonly _kind = 'CreateBucket'
  },
  PutObjectCommand: class extends FakeCmd {
    readonly _kind = 'PutObject'
  },
  GetObjectCommand: class extends FakeCmd {
    readonly _kind = 'GetObject'
  },
  DeleteObjectCommand: class extends FakeCmd {
    readonly _kind = 'DeleteObject'
  },
}))

vi.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: vi.fn().mockResolvedValue('https://signed.example/doc?sig=abc'),
}))

describe('storage/s3', () => {
  beforeEach(async () => {
    sendMock.mockReset()
    const { closeS3 } = await import('./s3.js')
    closeS3()
  })

  afterEach(async () => {
    const { closeS3 } = await import('./s3.js')
    closeS3()
  })

  describe('ensureBucket', () => {
    it('HEAD ok → não cria bucket', async () => {
      sendMock.mockResolvedValueOnce({}) // HeadBucket
      const { ensureBucket } = await import('./s3.js')
      await ensureBucket('meu-bucket')
      expect(sendMock).toHaveBeenCalledTimes(1)
      expect(
        (sendMock.mock.calls[0]![0] as { _kind: string; input: { Bucket: string } })._kind,
      ).toBe('HeadBucket')
    })

    it('HEAD 404 → chama CreateBucket', async () => {
      sendMock
        .mockRejectedValueOnce(
          Object.assign(new Error('not found'), {
            name: 'NotFound',
            $metadata: { httpStatusCode: 404 },
          }),
        )
        .mockResolvedValueOnce({}) // CreateBucket
      const { ensureBucket } = await import('./s3.js')
      await ensureBucket('novo')
      expect(sendMock).toHaveBeenCalledTimes(2)
      const second = sendMock.mock.calls[1]![0] as {
        _kind: string
        input: { Bucket: string }
      }
      expect(second._kind).toBe('CreateBucket')
      expect(second.input.Bucket).toBe('novo')
    })

    it('HEAD com erro diferente de 404 → propaga', async () => {
      sendMock.mockRejectedValueOnce(
        Object.assign(new Error('forbidden'), {
          name: 'AccessDenied',
          $metadata: { httpStatusCode: 403 },
        }),
      )
      const { ensureBucket } = await import('./s3.js')
      await expect(ensureBucket('x')).rejects.toThrow(/forbidden/)
      expect(sendMock).toHaveBeenCalledTimes(1) // não tentou CreateBucket
    })
  })

  describe('putObject', () => {
    it('envia PutObjectCommand com Bucket/Key/ContentType', async () => {
      sendMock.mockResolvedValueOnce({})
      const { putObject } = await import('./s3.js')
      await putObject({
        key: 'fun-x/doc-y.pdf',
        body: Buffer.from('pdf-bytes'),
        contentType: 'application/pdf',
      })
      const cmd = sendMock.mock.calls[0]![0] as {
        _kind: string
        input: { Bucket: string; Key: string; ContentType: string; Body: Buffer }
      }
      expect(cmd._kind).toBe('PutObject')
      expect(cmd.input.Key).toBe('fun-x/doc-y.pdf')
      expect(cmd.input.ContentType).toBe('application/pdf')
      expect(cmd.input.Bucket).toBe('hr-funcionario-documentos-test')
    })
  })

  describe('deleteObject', () => {
    it('envia DeleteObjectCommand', async () => {
      sendMock.mockResolvedValueOnce({})
      const { deleteObject } = await import('./s3.js')
      await deleteObject('chave-x')
      const cmd = sendMock.mock.calls[0]![0] as { _kind: string; input: { Key: string } }
      expect(cmd._kind).toBe('DeleteObject')
      expect(cmd.input.Key).toBe('chave-x')
    })
  })

  describe('getPresignedDownloadUrl', () => {
    it('usa getSignedUrl com GetObjectCommand e retorna URL', async () => {
      const { getPresignedDownloadUrl } = await import('./s3.js')
      const url = await getPresignedDownloadUrl('chave-x', 600)
      expect(url).toBe('https://signed.example/doc?sig=abc')

      const { getSignedUrl } = await import('@aws-sdk/s3-request-presigner')
      expect(getSignedUrl).toHaveBeenCalledTimes(1)
      const [, cmd, opts] = (getSignedUrl as unknown as { mock: { calls: unknown[][] } }).mock
        .calls[0]!
      expect((cmd as { _kind: string; input: { Key: string } })._kind).toBe('GetObject')
      expect((cmd as { input: { Key: string } }).input.Key).toBe('chave-x')
      expect((opts as { expiresIn: number }).expiresIn).toBe(600)
    })
  })
})
