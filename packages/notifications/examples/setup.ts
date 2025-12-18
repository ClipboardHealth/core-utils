import {
  type BackgroundJobsAdapter,
  type BackgroundJobsImplementation,
  type EnqueueOptions,
  type HandlerClassOrInstance,
} from "@clipboard-health/background-jobs-adapter";

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

  constructor(params: { defaultMeta: Record<string, unknown> }) {
    this.defaultMeta = params.defaultMeta;
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
