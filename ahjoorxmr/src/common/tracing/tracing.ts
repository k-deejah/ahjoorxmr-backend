import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { Resource } from '@opentelemetry/resources';
import {
  SEMRESATTRS_SERVICE_NAME,
  SEMRESATTRS_SERVICE_VERSION,
  SEMRESATTRS_DEPLOYMENT_ENVIRONMENT,
} from '@opentelemetry/semantic-conventions';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';

let sdk: NodeSDK | null = null;

export function initializeTracing(): NodeSDK | null {
  const otlpEndpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;

  if (!otlpEndpoint) {
    console.log(
      'OpenTelemetry tracing disabled: OTEL_EXPORTER_OTLP_ENDPOINT not set',
    );
    return null;
  }

  sdk = new NodeSDK({
    resource: new Resource({
      [SEMRESATTRS_SERVICE_NAME]:
        process.env.OTEL_SERVICE_NAME || 'ahjoorxmr-backend',
      [SEMRESATTRS_SERVICE_VERSION]:
        process.env.OTEL_SERVICE_VERSION || process.env.npm_package_version || '0.0.1',
      [SEMRESATTRS_DEPLOYMENT_ENVIRONMENT]:
        process.env.NODE_ENV || 'development',
    }),
    traceExporter: new OTLPTraceExporter({ url: otlpEndpoint }),
    // Auto-instruments HTTP, Express, NestJS, PostgreSQL, Redis, BullMQ, and more
    instrumentations: [
      getNodeAutoInstrumentations({
        '@opentelemetry/instrumentation-fs': { enabled: false }, // too noisy
        '@opentelemetry/instrumentation-http': { enabled: true },
        '@opentelemetry/instrumentation-express': { enabled: true },
        '@opentelemetry/instrumentation-pg': { enabled: true },
        '@opentelemetry/instrumentation-ioredis': { enabled: true },
      }),
    ],
  });

  sdk.start();
  console.log('OpenTelemetry tracing initialized');

  process.on('SIGTERM', () => {
    sdk!
      .shutdown()
      .then(() => console.log('OpenTelemetry SDK shut down'))
      .catch((err) => console.error('Error shutting down OpenTelemetry SDK', err));
  });

  return sdk;
}

export function getTracer(name = 'ahjoorxmr-backend') {
  const { trace } = require('@opentelemetry/api');
  return trace.getTracer(name);
}
