import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node'
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http'
import { resourceFromAttributes } from '@opentelemetry/resources'
import { NodeSDK } from '@opentelemetry/sdk-node'
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions'

import { env } from './config/env.js'

const SERVICE_VERSION = process.env.npm_package_version ?? '0.0.0'

let sdk: NodeSDK | null = null

if (env.OTEL_ENABLED) {
  const exporterOptions = env.OTEL_EXPORTER_OTLP_ENDPOINT
    ? { url: `${env.OTEL_EXPORTER_OTLP_ENDPOINT}/v1/traces` }
    : {}

  sdk = new NodeSDK({
    resource: resourceFromAttributes({
      [ATTR_SERVICE_NAME]: env.OTEL_SERVICE_NAME,
      [ATTR_SERVICE_VERSION]: SERVICE_VERSION,
    }),
    traceExporter: new OTLPTraceExporter(exporterOptions),
    instrumentations: [
      getNodeAutoInstrumentations({
        '@opentelemetry/instrumentation-fs': { enabled: false },
        '@opentelemetry/instrumentation-pino': { enabled: true },
        '@opentelemetry/instrumentation-http': { enabled: true },
        '@opentelemetry/instrumentation-undici': { enabled: true },
        '@opentelemetry/instrumentation-mongodb': { enabled: true },
      }),
    ],
  })

  sdk.start()
}

export async function shutdownTracing(): Promise<void> {
  if (sdk) {
    await sdk.shutdown()
    sdk = null
  }
}
