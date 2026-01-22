import {
  type BackgroundJobsAdapter,
  type BackgroundJobsImplementation,
  type EnqueueOptions,
  type HandlerClassOrInstance,
} from "@clipboard-health/background-jobs-adapter";
import { type Span, type TraceOptions, type Tracer } from "@clipboard-health/notifications";
import { type Logger, toError } from "@clipboard-health/util-ts";

/**
 * Assume this is `@clipboard-health/mongo-jobs` or `@clipboard-health/background-jobs-postgres`.
 */
export class BackgroundJobsService implements BackgroundJobsAdapter {
  implementation: BackgroundJobsImplementation = "mongo";

  async enqueue<T>(
    _handler: string | HandlerClassOrInstance<T>,
    _data: T,
    _options?: EnqueueOptions,
  ): Promise<unknown> {
    throw new Error("Method not implemented.");
  }
}

export class CBHLogger {
  public readonly defaultMeta: Record<string, unknown>;

  constructor(params?: { defaultMeta: Record<string, unknown> }) {
    this.defaultMeta = params?.defaultMeta ?? {};
  }

  public info(message: string, context: Record<string, unknown>) {
    console.info(message, { ...this.defaultMeta, ...context });
  }

  public error(message: string, context: Record<string, unknown>) {
    console.error(message, { ...this.defaultMeta, ...context });
  }

  public warn(message: string, context: Record<string, unknown>) {
    console.warn(message, { ...this.defaultMeta, ...context });
  }
}

type Metadata = Record<string, unknown>;

export function toLogger(logger: CBHLogger): Logger {
  return {
    info: (message, metadata) => {
      logger.info(String(message), metadata as Metadata);
    },
    warn: (message, metadata) => {
      logger.warn(String(message), metadata as Metadata);
    },
    error: (error, metadata) => {
      logger.error(toError(error).message, metadata as Metadata);
    },
  };
}

export const tracer: Tracer = {
  trace: <T>(_name: string, _options: TraceOptions, fun: (span?: Span) => T): T => fun(),
};
