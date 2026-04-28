import { trace, context, SpanStatusCode, Span } from '@opentelemetry/api';

const tracer = trace.getTracer('stellar-service');

export interface StellarSpanOptions {
  network: string;
  contractAddress?: string;
}

/**
 * Wraps a Stellar SDK call in a named span tagged with network and contract.
 * Span names match the issue spec: stellar.submit_transaction,
 * stellar.get_account, stellar.simulate_transaction.
 */
export async function withStellarSpan<T>(
  spanName: string,
  opts: StellarSpanOptions,
  fn: (span: Span) => Promise<T>,
): Promise<T> {
  return tracer.startActiveSpan(spanName, async (span) => {
    span.setAttributes({
      'stellar.network': opts.network,
      ...(opts.contractAddress
        ? { 'contract.address': opts.contractAddress }
        : {}),
    });

    try {
      const result = await fn(span);
      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (err: any) {
      span.setStatus({ code: SpanStatusCode.ERROR, message: err?.message });
      span.recordException(err);
      throw err;
    } finally {
      span.end();
    }
  });
}

// ── W3C traceparent propagation helpers for BullMQ ──────────────────────────

import {
  propagation,
  ROOT_CONTEXT,
  TextMapGetter,
  TextMapSetter,
} from '@opentelemetry/api';

const mapGetter: TextMapGetter<Record<string, string>> = {
  get: (carrier, key) => carrier[key],
  keys: (carrier) => Object.keys(carrier),
};

const mapSetter: TextMapSetter<Record<string, string>> = {
  set: (carrier, key, value) => { carrier[key] = value; },
};

/** Inject current trace context into a plain object (for BullMQ job data). */
export function injectTraceContext(carrier: Record<string, string>): void {
  propagation.inject(context.active(), carrier, mapSetter);
}

/** Restore trace context from a plain object (inside a BullMQ processor). */
export function extractTraceContext(
  carrier: Record<string, string>,
) {
  return propagation.extract(ROOT_CONTEXT, carrier, mapGetter);
}
