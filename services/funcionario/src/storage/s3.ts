/**
 * Camada thin sobre @aws-sdk/client-s3 para upload, presign e ensure de
 * bucket. Funciona contra MinIO em dev/teste e contra AWS S3 em prod sem
 * mudança de código — apenas envs.
 *
 * Por que dois clientes:
 *   - `_client` usa S3_ENDPOINT (rede interna; ex: `http://minio:9000` no
 *     compose). É usado por todas as operações que rodam no servidor.
 *   - `_presigner` usa S3_PUBLIC_ENDPOINT (alcançável pelo cliente final;
 *     ex: `http://localhost:9100`). A URL assinada precisa apontar para um
 *     host que o browser/Postman consiga resolver — se assinasse contra o
 *     hostname interno, o download daria DNS error fora do Docker.
 *
 *   Em produção (AWS S3 real) ambos os endpoints são o mesmo (ou omitidos)
 *   e os dois clientes coincidem.
 */
import {
  S3Client,
  HeadBucketCommand,
  CreateBucketCommand,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

import { env } from '../config/env.js'

let _client: S3Client | null = null
let _presigner: S3Client | null = null

function buildClient(endpoint: string): S3Client {
  return new S3Client({
    region: env.S3_REGION,
    endpoint,
    forcePathStyle: env.S3_FORCE_PATH_STYLE,
    credentials: {
      accessKeyId: env.S3_ACCESS_KEY,
      secretAccessKey: env.S3_SECRET_KEY,
    },
  })
}

export function getS3Client(): S3Client {
  if (!_client) _client = buildClient(env.S3_ENDPOINT)
  return _client
}

function getPresignerClient(): S3Client {
  if (!_presigner) _presigner = buildClient(env.S3_PUBLIC_ENDPOINT ?? env.S3_ENDPOINT)
  return _presigner
}

/**
 * Cria o bucket se não existir. Idempotente. Lança em qualquer outro erro
 * (permissão, conectividade etc.) para falhar fast no bootstrap.
 */
export async function ensureBucket(bucket: string = env.S3_BUCKET): Promise<void> {
  const client = getS3Client()
  try {
    await client.send(new HeadBucketCommand({ Bucket: bucket }))
    return
  } catch (err) {
    const name = (err as { name?: string; $metadata?: { httpStatusCode?: number } }).name
    const status = (err as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode
    const naoExiste = name === 'NotFound' || name === 'NoSuchBucket' || status === 404
    if (!naoExiste) throw err
  }
  await client.send(new CreateBucketCommand({ Bucket: bucket }))
}

export interface PutObjectInput {
  readonly key: string
  readonly body: Buffer | Uint8Array
  readonly contentType: string
}

export async function putObject(input: PutObjectInput): Promise<void> {
  await getS3Client().send(
    new PutObjectCommand({
      Bucket: env.S3_BUCKET,
      Key: input.key,
      Body: input.body,
      ContentType: input.contentType,
    }),
  )
}

export async function deleteObject(key: string): Promise<void> {
  await getS3Client().send(new DeleteObjectCommand({ Bucket: env.S3_BUCKET, Key: key }))
}

export async function getPresignedDownloadUrl(
  key: string,
  expiresInSeconds: number = env.S3_PRESIGN_EXPIRES_SECONDS,
): Promise<string> {
  return getSignedUrl(
    getPresignerClient(),
    new GetObjectCommand({ Bucket: env.S3_BUCKET, Key: key }),
    { expiresIn: expiresInSeconds },
  )
}

/** Para uso em shutdown e nos testes que precisam isolar o client. */
export function closeS3(): void {
  _client?.destroy()
  _presigner?.destroy()
  _client = null
  _presigner = null
}
