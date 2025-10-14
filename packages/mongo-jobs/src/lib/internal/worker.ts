import type mongoose from "mongoose";

import type { BackgroundJobType } from "../job";
import { withConsumerTrace, withInternalsTrace } from "../tracing";
import type { Cron } from "./cron";
import { DuplicateRunningError } from "./duplicateRunningError";
import type { JobsRepository } from "./jobsRepository";
import type { Logger } from "./logger";
import type { Metrics } from "./metrics";
import { isMongoDuplicateError } from "./mongoDuplicate";
import type { Registry } from "./registry";
import { FairQueueConsumer } from "./worker/fairQueueConsumer";
import type { QueueConsumer } from "./worker/queueConsumer";

export interface WorkerOptions {
  maxConcurrency?: number;
  newJobCheckWaitMS?: number;
  useChangeStream?: boolean;
  lockTimeoutMS?: number;
  unlockJobsIntervalMS?: number;
  refreshQueuesIntervalMS?: number;
  exclude?: string[];
}

interface ConstructorOptions extends WorkerOptions {
  groups: string[];
  metrics: Metrics;
  logger: Logger | undefined;
  jobsRepo: JobsRepository;
  registry: Registry;
  cron: Cron;
}

const MILLIS_IN_SECOND = 1000;
const DEFAULT_LOCK_TIMEOUT = 600 * MILLIS_IN_SECOND; // 10 minutes
const DEFAULT_MAX_CONCURRENCY = 10;
const DEFAULT_NEW_JOB_CHECK_WAIT = 10 * MILLIS_IN_SECOND; // 10 seconds
const DEFAULT_USE_CHANGE_STREAM = true;
const DEFAULT_UNLOCK_JOBS_INTERVAL = 60 * MILLIS_IN_SECOND; // 1 minute
const DEFAULT_REFRESH_QUEUES_INTERVAL = 30 * MILLIS_IN_SECOND; // 30 seconds
const DUPLICATE_RESCHEDULE_TIME = 5 * MILLIS_IN_SECOND; // 5 seconds
const DEFAULT_MAX_ATTEMPTS = 10;
const GRACEFUL_SHUTDOWN_WAIT = 30 * MILLIS_IN_SECOND; // 30 seconds

function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  return JSON.stringify(error);
}

function errorToString(error: unknown): string {
  if (error instanceof Error) {
    return error.stack ?? error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  return JSON.stringify(error);
}

function fromNow(millis: number): Date {
  return new Date(Date.now() + millis);
}

async function delay(time: number): Promise<void> {
  await new Promise((resolve) => {
    setTimeout(resolve, time);
  });
}

function removeItemFromArray<T>(array: T[], item: T) {
  const index = array.indexOf(item);
  if (index > -1) {
    array.splice(index, 1);
  }
}

export class Worker {
  public stopped = true;

  private readonly lockTimeoutMS: number;
  private readonly maxConcurrency: number;
  private readonly newJobCheckWaitMS: number;
  private readonly useChangeStream: boolean;

  private readonly unlockJobsIntervalMS: number;
  private readonly refreshQueuesIntervalMS: number;
  private readonly jobsRepo: JobsRepository;
  private readonly runningJobs = new Map<mongoose.Types.ObjectId, Promise<unknown>>();
  private readonly metrics: Metrics;
  private readonly registry: Registry;
  private readonly cron: Cron;
  private readonly logger: Logger | undefined;
  private readonly queueConsumer: QueueConsumer;

  private unlockJobsInterval?: NodeJS.Timeout;
  private workerLoopInterval?: NodeJS.Timeout;
  private fetchingJobs = false;
  private newJobsWatched = false;
  private nextAvailableJobCheck = new Date();

  constructor(options: ConstructorOptions) {
    this.metrics = options.metrics;
    this.lockTimeoutMS = options.lockTimeoutMS ?? DEFAULT_LOCK_TIMEOUT;
    this.maxConcurrency = options.maxConcurrency ?? DEFAULT_MAX_CONCURRENCY;
    this.newJobCheckWaitMS = options.newJobCheckWaitMS ?? DEFAULT_NEW_JOB_CHECK_WAIT;
    this.useChangeStream = options.useChangeStream ?? DEFAULT_USE_CHANGE_STREAM;
    this.unlockJobsIntervalMS = options.unlockJobsIntervalMS ?? DEFAULT_UNLOCK_JOBS_INTERVAL;
    this.refreshQueuesIntervalMS =
      options.refreshQueuesIntervalMS ?? DEFAULT_REFRESH_QUEUES_INTERVAL;
    this.jobsRepo = options.jobsRepo;
    this.registry = options.registry;
    this.cron = options.cron;
    this.logger = options.logger;

    const queues = this.registry.getQueuesForGroups(options.groups);

    if (options.exclude) {
      for (const excludedQueue of options.exclude) {
        removeItemFromArray(queues, excludedQueue);
      }
    }

    this.queueConsumer = new FairQueueConsumer(queues, options.jobsRepo);
  }

  public async start() {
    this.stopped = false;
    this.logger?.info("Starting Background Processing");

    this.unlockJobsInterval = setInterval(() => {
      void this.unlockStuckJobs();
    }, this.unlockJobsIntervalMS);

    this.workerLoopInterval = setInterval(() => {
      void this.workerLoop();
    }, this.newJobCheckWaitMS);

    await this.queueConsumer.start({
      useChangeStream: this.useChangeStream,
      refreshQueuesIntervalMS: this.refreshQueuesIntervalMS,
    });

    void this.unlockStuckJobs();
    void this.workerLoop();
  }

  public async acquireNextJob(): Promise<BackgroundJobType<unknown> | undefined> {
    try {
      return await this.queueConsumer.acquireNextJob();
    } catch (error) {
      this.logger?.error(`Error while getting job: ${errorMessage(error)}`);
      return undefined;
    }
  }

  public async runJobHandler(job: BackgroundJobType<unknown>) {
    this.reportExecutionDelay(job);

    await withConsumerTrace(job, async () => {
      const { handlerName } = job;
      const { handler } = this.registry.getRegisteredHandler(handlerName);
      const { data } = job;
      await handler.perform(data, job);
    });
  }

  public async stop(waitTime?: number) {
    this.logger?.info("Background Jobs: Stopping");
    this.stopped = true;
    clearInterval(this.workerLoopInterval);
    clearInterval(this.unlockJobsInterval);

    // Stop metrics reporting first to prevent further database operations
    this.metrics.stopReporting();

    await this.queueConsumer.stop();

    const shutdownWaitPromise = delay(waitTime ?? GRACEFUL_SHUTDOWN_WAIT);
    const jobsWaitPromise = Promise.all(this.runningJobs.values());

    await Promise.race([shutdownWaitPromise, jobsWaitPromise]);

    if (this.runningJobs.size > 0) {
      const runningJobsIds = [...this.runningJobs.keys()].join(", ");
      this.logger?.error(`Following jobs didn't end on time during shutdown: ${runningJobsIds}`);
    }

    this.logger?.info("Background Jobs: Stopped");
  }

  public async markJobCompleted(job: BackgroundJobType<unknown>) {
    await this.jobsRepo.deleteJobs([job._id]);
  }

  public getConsumedQueues(): string[] {
    return this.queueConsumer.getConsumedQueues();
  }

  public async updateUniqueKey(job: BackgroundJobType<unknown>): Promise<void> {
    try {
      const uniqueOptions = job.options?.unique;

      if (!uniqueOptions) {
        return;
      }

      if (job.uniqueKey === uniqueOptions.runningKey) {
        return;
      }

      const operation = uniqueOptions.runningKey
        ? { $set: { uniqueKey: uniqueOptions.runningKey } }
        : { $unset: { uniqueKey: "" } };

      await this.jobsRepo.updateOne(job._id, operation);
    } catch (error) {
      throw isMongoDuplicateError(error) ? new DuplicateRunningError(error.message) : error;
    }
  }

  private async workerLoop() {
    if (
      this.stopped ||
      this.fetchingJobs ||
      this.runningJobs.size >= this.maxConcurrency ||
      new Date() < this.nextAvailableJobCheck
    ) {
      return;
    }

    while (this.runningJobs.size < this.maxConcurrency) {
      this.fetchingJobs = true;
      /* I know that fetching jobs one by one here is terrible,
         but unfortunately Mongo doesn't support updateMany with limit.
         So from all bad solutions this seemed the least terrible. */

      // eslint-disable-next-line no-await-in-loop
      const job = await this.acquireNextJob();
      this.fetchingJobs = false;

      if (!job) {
        this.scheduleWorkerLoopAfterWait();
        break;
      }

      void this.performJob(job);
    }
  }

  private handleNewJobEvent() {
    this.newJobsWatched = false;
    this.nextAvailableJobCheck = new Date();
    void this.workerLoop();
  }

  private scheduleWorkerLoopAfterWait() {
    this.nextAvailableJobCheck = fromNow(this.newJobCheckWaitMS);

    if (!this.newJobsWatched) {
      this.newJobsWatched = true;

      this.queueConsumer.addEventListener(
        "newJob",
        () => {
          this.handleNewJobEvent();
        },
        { once: true },
      );
    }

    setTimeout(() => {
      void this.workerLoop();
    }, this.newJobCheckWaitMS);
  }

  private async performJob(job: BackgroundJobType<unknown>) {
    let jobPromiseResolve: (value?: unknown) => void;
    const jobPromise = new Promise((resolve) => {
      jobPromiseResolve = resolve;
    });

    await withInternalsTrace("performJob", async () => {
      try {
        this.runningJobs.set(job._id, jobPromise);
        await this.cron.maybeScheduleNextJob(job);
        await this.updateUniqueKey(job);
        await this.runJobHandler(job);
        await this.markJobCompleted(job);
      } catch (error) {
        if (error instanceof DuplicateRunningError) {
          void this.duplicateReschedule(job);
        } else {
          this.logger?.error(
            `Error while performing job ${job._id.toString()}: ${errorMessage(error)}`,
          );
          void this.handleJobError(job, errorToString(error));
        }
      } finally {
        this.runningJobs.delete(job._id);
        jobPromiseResolve();
        void this.workerLoop();
      }
    });
  }

  private async handleJobError(job: BackgroundJobType<unknown>, error: string): Promise<void> {
    try {
      const attemptsCount = job.attemptsCount + 1;
      const maxAttempts = this.getMaxAttemptsForJob(job);

      // eslint-disable-next-line unicorn/prefer-ternary
      if (attemptsCount < maxAttempts) {
        await this.scheduleRetry(job, attemptsCount, error);
      } else {
        await this.markJobFailed(job, attemptsCount, error);
      }
    } catch {
      this.logger?.error(
        `Error while marking job as failed. Job id: ${job._id.toString()}, error: ${errorMessage(
          error,
        )}`,
      );
    }
  }

  private async duplicateReschedule(job: BackgroundJobType<unknown>) {
    await this.jobsRepo.updateOne(job._id, {
      $set: {
        nextRunAt: fromNow(DUPLICATE_RESCHEDULE_TIME),
      },
      $unset: {
        lockedAt: "",
      },
    });
  }

  private async unlockStuckJobs() {
    const lockedAtThreshold = fromNow(-this.lockTimeoutMS);

    for (;;) {
      // eslint-disable-next-line no-await-in-loop
      const job = await this.jobsRepo.unlockFirstExpiredJob(lockedAtThreshold);

      if (!job) {
        return;
      }

      this.metrics.increment(job.queue, "expired");
      this.logger?.error("Background job expired", this.logContext(job));
    }
  }

  private reportExecutionDelay(job: BackgroundJobType<unknown>) {
    if (!job.nextRunAt) {
      return;
    }

    this.metrics.timing(job.queue, "delay", job.nextRunAt);
  }

  private logContext(job: BackgroundJobType<unknown>) {
    return {
      jobId: job._id.toString(),
      queue: job.queue,
      handlerName: job.handlerName,
      attemptsCount: job.attemptsCount,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
      nextRunAt: job.nextRunAt,
      lockedAt: job.lockedAt,
    };
  }

  private getMaxAttemptsForJob(job: BackgroundJobType<unknown>): number {
    try {
      const { handlerName } = job;
      const { handler } = this.registry.getRegisteredHandler(handlerName);
      return handler.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
    } catch {
      return DEFAULT_MAX_ATTEMPTS;
    }
  }

  private async markJobFailed(
    job: BackgroundJobType<unknown>,
    attemptsCount: number,
    error: string,
  ): Promise<void> {
    this.logger?.error(`Background Job Failed: ${job.handlerName}`, {
      ...this.logContext(job),
      error,
    });

    await this.jobsRepo.updateOne(job._id, {
      $set: {
        lastError: error,
        failedAt: new Date(),
        attemptsCount,
        originalQueue: job.queue,
      },
      $unset: {
        queue: "",
        nextRunAt: "",
        uniqueKey: "",
      },
    });
  }

  private async scheduleRetry(
    job: BackgroundJobType<unknown>,
    attemptsCount: number,
    error: string,
  ): Promise<void> {
    const exponentialBackoffTime = 2 ** attemptsCount * MILLIS_IN_SECOND;
    const nextRunAt = fromNow(exponentialBackoffTime);

    this.metrics.increment(job.queue, "retry");

    await this.jobsRepo.updateOne(job._id, {
      $set: {
        lastError: error.toString(),
        nextRunAt,
        attemptsCount,
      },
      $unset: {
        lockedAt: "",
      },
    });
  }
}
