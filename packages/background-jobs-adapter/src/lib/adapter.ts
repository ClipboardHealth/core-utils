export type BackgroundJobsImplementation = "mongo" | "postgres";

export interface Handler<TData> {
  perform(data: TData, job?: unknown): Promise<string | void>;
}

/**
 * Base handler interface that supports each implementation.
 */
export interface BaseHandler<T> extends Handler<T> {
  name?: string; // Mongo uses this
}

/**
 * Handler class interface that supports each implementation.
 */
export interface BaseHandlerClass<T> {
  queueName?: string; // Postgres uses this
  new (...arguments_: never[]): Handler<T>;
}

/**
 * Union type for handler class or instance.
 */
export type HandlerClassOrInstance<T> = BaseHandlerClass<T> | BaseHandler<T>;

interface WithStartAt {
  /**
   * When the job should start being processed.
   */
  startAt?: Date;
}

export interface MongoEnqueueOptions extends WithStartAt {
  session?: unknown;
  unique?: string | { enqueuedKey: string | undefined; runningKey: string | undefined };
}

export interface PostgresEnqueueOptions extends WithStartAt {
  idempotencyKey?: string;
  transaction?: unknown;
}

/**
 * Common type of enqueue options.
 *
 * @example
 * ```ts
 * const enqueueOptions = {
 *   [ENQUEUE_FIELD_NAMES[this.adapter.implementation].idempotencyKey]: idempotencyKey,
 * }
 * ```
 */
type EnqueueFields = keyof PostgresEnqueueOptions;
export const ENQUEUE_FIELD_NAMES = {
  mongo: {
    startAt: "startAt",
    transaction: "session",
    idempotencyKey: "unique",
  } as const satisfies Record<EnqueueFields, keyof MongoEnqueueOptions>,
  postgres: {
    startAt: "startAt",
    idempotencyKey: "idempotencyKey",
    transaction: "transaction",
  } as const satisfies Record<EnqueueFields, keyof PostgresEnqueueOptions>,
} as const;

export type EnqueueOptions = MongoEnqueueOptions | PostgresEnqueueOptions;

/**
 * Minimal adapter interface for background jobs operations supporting mongo-jobs (Mongo)
 * and background-jobs-postgres (Postgres) implementations.
 */
export interface BackgroundJobsAdapter<
  TImplementation extends BackgroundJobsImplementation = BackgroundJobsImplementation,
> {
  implementation: TImplementation;

  /**
   * Enqueue a job to be processed.
   *
   * @param handler - The handler class or instance that will process the job
   * @param data - The data to be processed by the handler
   * @param options - Optional configuration for the job
   * @returns A promise that resolves to the enqueued job or undefined (implementation-specific)
   */
  enqueue<T>(
    handler: string | HandlerClassOrInstance<T>,
    data: T,
    options?: TImplementation extends "mongo"
      ? MongoEnqueueOptions
      : TImplementation extends "postgres"
        ? PostgresEnqueueOptions
        : EnqueueOptions,
  ): Promise<unknown>;
}
