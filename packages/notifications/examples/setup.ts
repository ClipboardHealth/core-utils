import {
  type BackgroundJobsAdapter,
  type BackgroundJobsImplementation,
  type EnqueueOptions,
  type HandlerClassOrInstance,
} from "@clipboard-health/background-jobs-adapter";

/**
 * Assume this is `background-jobs-mongo` or `background-jobs-postgres`.
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
