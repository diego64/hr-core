/**
 * Helper de teste — HTTP server local que finge ser um microsserviço
 * downstream. Registra cada request recebida e responde JSON configurável.
 *
 * Permite validar o `@fastify/http-proxy` do gateway sem depender de
 * `funcionario-service` etc.
 */
import { createServer, type IncomingMessage, type Server } from 'node:http'

export interface ReceivedRequest {
  readonly method: string
  readonly url: string
  readonly headers: NodeJS.Dict<string | string[]>
  readonly body: string
}

export interface UpstreamServer {
  readonly url: string
  readonly requests: ReceivedRequest[]
  setResponder: (
    fn: (req: IncomingMessage, body: string) => { status: number; body: string },
  ) => void
  stop: () => Promise<void>
}

export async function startUpstream(): Promise<UpstreamServer> {
  const requests: ReceivedRequest[] = []
  let responder: (req: IncomingMessage, body: string) => { status: number; body: string } = (
    req,
    body,
  ) => ({
    status: 200,
    body: JSON.stringify({ ok: true, url: req.url, body: body ? JSON.parse(body) : null }),
  })

  const server: Server = createServer((req, res) => {
    let body = ''
    req.on('data', (chunk: Buffer) => {
      body += chunk.toString()
    })
    req.on('end', () => {
      requests.push({ method: req.method ?? '', url: req.url ?? '', headers: req.headers, body })
      const out = responder(req, body)
      res.writeHead(out.status, { 'content-type': 'application/json' })
      res.end(out.body)
    })
  })

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') {
    throw new Error('failed to start upstream')
  }
  const url = `http://127.0.0.1:${address.port}`

  return {
    url,
    requests,
    setResponder(fn) {
      responder = fn
    },
    async stop() {
      await new Promise<void>((resolve, reject) =>
        server.close((err) => (err ? reject(err) : resolve())),
      )
    },
  }
}
