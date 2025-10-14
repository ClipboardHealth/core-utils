import {
  type Context,
  context,
  propagation,
  ROOT_CONTEXT,
  type Span,
  SpanKind,
  SpanStatusCode,
  trace,
} from "@opentelemetry/api";

import type { HandlerInterface } from "./handler";
import type { BackgroundJobType } from "./job";

export interface TraceHeaders {
  _traceHeaders?: Record<string, string>;
}

// According to the OpenTelemetry spec, the span name should follow the pattern of
//   <destination name> <operation name>
// Where destination is the name of the queue and operation is the action being performed
//
// https://opentelemetry.io/docs/reference/specification/trace/semantic_conventions/messaging/#span-name
const TRACER_NAME = "background-jobs-mongo";
const PRODUCER_SPAN = "background-jobs.producer";
const CONSUMER_SPAN = "background-jobs.consumer";
const INTERNALS_SPAN = "background-jobs.internals";

const Component = {
  BACKGROUND_JOBS: "background-jobs",
} as const;

const Operation = {
  PROCESS: "process",
  PUBLISH: "publish",
} as const;

const MessagingSystem = {
  MONGO: "mongo-background-jobs",
} as const;

const MessagingDestinationKind = {
  QUEUE: "queue",
} as const;

type OperationType = (typeof Operation)[keyof typeof Operation];

function resourceName(operation: OperationType, destination: string): string {
  return `${operation} ${destination}`;
}

/**
 * Inject trace context into headers for propagation.
 * This allows child spans to link back to the current parent span.
 */
function injectTraceHeaders(): Record<string, string> {
  const traceHeaders: Record<string, string> = {};
  propagation.inject(context.active(), traceHeaders);
  return traceHeaders;
}

/**
 * Extract trace context from headers to link spans.
 * Returns a context with the parent span information.
 */
function extractTraceContext(traceHeaders?: Record<string, string>): Context {
  if (!traceHeaders) {
    return context.active();
  }

  return propagation.extract(context.active(), traceHeaders);
}

/**
 * Create attributes for a producer telemetry span.
 *
 * Attributes definition for background jobs are still in RFC
 * in the meantime, we should use the `messaging` convention
 *
 * Issue containing the RFC:
 *  - https://github.com/open-telemetry/opentelemetry-specification/pull/1582#issue-842434527
 *
 * Datadog supports the `messaging` convention:
 * - https://docs.datadoghq.com/tracing/trace_collection/tracing_naming_convention#message-queue
 */
function producerAttributes(job: BackgroundJobType<unknown>): Record<string, string> {
  return {
    component: Component.BACKGROUND_JOBS,
    "messaging.system": MessagingSystem.MONGO,
    "messaging.operation": Operation.PUBLISH,
    "messaging.destination": job.handlerName,
    "messaging.destination_kind": MessagingDestinationKind.QUEUE,
    "messaging.mongo-bg-jobs.queue": job.queue,
    "resource.name": resourceName(Operation.PUBLISH, job.handlerName),
  };
}

function consumerAttributes(job: BackgroundJobType<unknown>): Record<string, string> {
  return {
    component: Component.BACKGROUND_JOBS,
    "span.type": "worker",
    "messaging.system": MessagingSystem.MONGO,
    "messaging.operation": Operation.PROCESS,
    "messaging.message_id": job._id.toString(),
    "messaging.destination": job.handlerName,
    "messaging.destination_kind": MessagingDestinationKind.QUEUE,
    "messaging.mongo-bg-jobs.queue": job.queue,
    "messaging.mongo-bg-jobs.attemptsCount": job.attemptsCount.toString(),
    "messaging.mongo-bg-jobs.createdAt": job.createdAt.toISOString(),
    "messaging.mongo-bg-jobs.updatedAt": job.updatedAt.toISOString(),
    "messaging.mongo-bg-jobs.nextRunAt": job.nextRunAt?.toISOString() ?? "",
    "messaging.mongo-bg-jobs.lockedAt": job.lockedAt?.toISOString() ?? "",
    "messaging.mongo-bg-jobs.failedAt": job.failedAt?.toISOString() ?? "",
    "resource.name": resourceName(Operation.PROCESS, job.handlerName),
  };
}

function isCronJob(job: BackgroundJobType<unknown>): boolean {
  return job.scheduleName !== undefined;
}

export async function withProducerTrace<T>(
  handler: HandlerInterface<T>,
  data: T,
  callback: (data: T & TraceHeaders) => Promise<BackgroundJobType<T> | undefined>,
): Promise<BackgroundJobType<T> | undefined> {
  const tracer = trace.getTracer(TRACER_NAME);
  const handlerName = handler.name;

  return await tracer.startActiveSpan(
    PRODUCER_SPAN,
    {
      kind: SpanKind.PRODUCER,
      attributes: {
        "resource.name": resourceName(Operation.PUBLISH, handlerName),
      },
    },
    async (span: Span) => {
      try {
        // Inject trace context for distributed tracing
        const traceHeaders = injectTraceHeaders();
        const job = await callback({ ...data, _traceHeaders: traceHeaders });

        if (job) {
          span.setAttributes(producerAttributes(job));
        }

        span.setStatus({ code: SpanStatusCode.OK });
        return job;
      } catch (error) {
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: error instanceof Error ? error.message : String(error),
        });
        span.recordException(error as Error);
        throw error;
      } finally {
        span.end();
      }
    },
  );
}

async function executeJobTrace(
  tracer: ReturnType<typeof trace.getTracer>,
  attributes: Record<string, string>,
  parentContext: Context,
  callback: () => Promise<void>,
): Promise<void> {
  await tracer.startActiveSpan(
    CONSUMER_SPAN,
    {
      kind: SpanKind.CONSUMER,
      attributes,
    },
    parentContext,
    async (span: Span) => {
      try {
        await callback();
        span.setStatus({ code: SpanStatusCode.OK });
      } catch (error) {
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: error instanceof Error ? error.message : String(error),
        });
        span.recordException(error as Error);
        throw error;
      } finally {
        span.end();
      }
    },
  );
}

export async function withConsumerTrace(
  job: BackgroundJobType<unknown>,
  callback: () => Promise<void>,
): Promise<void> {
  const tracer = trace.getTracer(TRACER_NAME);
  const attributes = consumerAttributes(job);

  let parentContext: Context;
  if (isCronJob(job)) {
    /**
     * We need to manually remove the context of traces for cron jobs.
     * Otherwise cron jobs traces are shown in the context of the entire worker and they
     * are not very pleasant to look at in Datadog (sometimes impossible).
     **/
    parentContext = ROOT_CONTEXT;
  } else {
    const jobData = job.data || {};
    parentContext = extractTraceContext(jobData._traceHeaders);
  }

  await executeJobTrace(tracer, attributes, parentContext, callback);
}

export async function withInternalsTrace<T>(
  resource: string,
  callback: () => Promise<T>,
): Promise<T> {
  const tracer = trace.getTracer(TRACER_NAME);

  return await tracer.startActiveSpan(
    INTERNALS_SPAN,
    {
      kind: SpanKind.INTERNAL,
      attributes: {
        "resource.name": resource,
      },
    },
    async (span: Span) => {
      try {
        const result = await callback();
        span.setStatus({ code: SpanStatusCode.OK });
        return result;
      } catch (error) {
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: error instanceof Error ? error.message : String(error),
        });
        span.recordException(error as Error);
        throw error;
      } finally {
        span.end();
      }
    },
  );
}
