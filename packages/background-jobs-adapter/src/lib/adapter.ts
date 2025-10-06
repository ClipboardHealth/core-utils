/**
 * Minimal adapter interface for background jobs operations supporting background-jobs-mongo (Mongo)
 * and background-jobs-postgres (Postgres) implementations.
 */

/**
 * Base handler interface that supports each implementation.
 */
export interface BaseHandler<T> {
  name?: string; // Mongo uses this
  perform(data: T, job?: unknown): Promise<unknown>;
}

/**
 * Handler class interface that supports each implementation.
 */
export interface BaseHandlerClass<T> {
  queueName?: string; // Postgres uses this
  new (...arguments_: never[]): BaseHandler<T>;
}

/**
 * Union type for handler class or instance.
 */
export type HandlerClassOrInstance<T> = BaseHandlerClass<T> | BaseHandler<T>;

/**
 * Common enqueue options that each implementation supports.
 */
export interface CommonEnqueueOptions {
  /**
   * When the job should start being processed.
   */
  startAt?: Date;

  /**
   * Database transaction/session to use for atomic job creation.
   * - Mongo: called `session`; ClientSession
   * - Postgres: DatabaseClient (Prisma transaction, pg client, etc.)
   */
  transaction?: unknown;

  /**
   * Unique key for job deduplication
   * - Mongo: called `unique`; string or JobUniqueOptions
   * - Postgres: idempotencyKey
   */
  idempotencyKey?: string | { enqueuedKey: string | undefined; runningKey: string | undefined };
}

/**
 * Minimal adapter interface for background jobs enqueue operations.
 */
export interface BackgroundJobsAdapter {
  /**
   * Enqueue a job to be processed.
   *
   * @param handler - The handler class or instance that will process the job
   * @param data - The data to be processed by the handler
   * @param options - Optional configuration for the job
   * @returns A promise that resolves to the enqueued job or undefined (implementation-specific)
   */
  enqueue<T extends Record<string, unknown>>(
    handler: string | HandlerClassOrInstance<T>,
    data: T,
    options?: CommonEnqueueOptions,
  ): Promise<unknown>;
}
