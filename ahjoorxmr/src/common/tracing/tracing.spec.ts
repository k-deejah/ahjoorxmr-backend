/**
 * Integration test: OpenTelemetry trace context propagation (#198)
 *
 * Verifies that a span created during job enqueuing becomes the parent of
 * the span created inside the BullMQ processor — i.e. a single trace with
 * a parent-child relationship across the async boundary.
 */
import {
  context,
  trace,
  propagation,
  ROOT_CONTEXT,
  SpanContext,
} from '@opentelemetry/api';
import {
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from '@opentelemetry/sdk-trace-base';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { W3CTraceContextPropagator } from '@opentelemetry/core';
import { injectTraceContext, extractTraceContext } from './stellar-tracing';

// ── Setup in-memory tracer ───────────────────────────────────────────────────

const exporter = new InMemorySpanExporter();
const provider = new NodeTracerProvider({
  spanProcessors: [new SimpleSpanProcessor(exporter)],
});
provider.register({ propagator: new W3CTraceContextPropagator() });

const tracer = trace.getTracer('test');

// ── Tests ────────────────────────────────────────────────────────────────────

describe('OTel trace context propagation across BullMQ boundary', () => {
  beforeEach(() => exporter.reset());

  afterAll(() => provider.shutdown());

  it('injectTraceContext produces a W3C traceparent carrier', () => {
    const reqSpan = tracer.startSpan('http.request');
    let carrier!: Record<string, string>;

    context.with(trace.setSpan(context.active(), reqSpan), () => {
      carrier = {};
      injectTraceContext(carrier);
    });
    reqSpan.end();

    expect(carrier['traceparent']).toMatch(
      /^00-[0-9a-f]{32}-[0-9a-f]{16}-\d{2}$/,
    );
  });

  it('extractTraceContext with empty carrier returns ROOT_CONTEXT', () => {
    const ctx = extractTraceContext({});
    expect(ctx).toBe(ROOT_CONTEXT);
  });

  it('job span shares the same traceId as the enqueuing request span', async () => {
    const reqSpan = tracer.startSpan('http.request');
    const reqTraceId = reqSpan.spanContext().traceId;
    let jobTraceId!: string;

    context.with(trace.setSpan(context.active(), reqSpan), () => {
      const carrier: Record<string, string> = {};
      injectTraceContext(carrier);

      const parentCtx = extractTraceContext(carrier);
      context.with(parentCtx, () => {
        const jobSpan = tracer.startSpan('bullmq.process');
        jobTraceId = jobSpan.spanContext().traceId;
        jobSpan.end();
      });
    });
    reqSpan.end();

    await provider.forceFlush();
    expect(jobTraceId).toBe(reqTraceId);
  });

  it('job span has the request span as its parent', async () => {
    const reqSpan = tracer.startSpan('http.request');
    const reqSpanId = reqSpan.spanContext().spanId;

    context.with(trace.setSpan(context.active(), reqSpan), () => {
      const carrier: Record<string, string> = {};
      injectTraceContext(carrier);

      const parentCtx = extractTraceContext(carrier);
      // Use startActiveSpan so the parent context is correctly linked
      tracer.startActiveSpan(
        'bullmq.process.parent-check',
        {},
        parentCtx,
        (jobSpan) => { jobSpan.end(); },
      );
    });
    reqSpan.end();

    await provider.forceFlush();

    const spans = exporter.getFinishedSpans();
    const jobSpan = spans.find((s) => s.name === 'bullmq.process.parent-check');
    expect(jobSpan).toBeDefined();
    // In this OTel SDK version parent info is on parentSpanContext
    const parentId =
      (jobSpan as any).parentSpanId ?? (jobSpan as any).parentSpanContext?.spanId;
    expect(parentId).toBe(reqSpanId);
  });
});
