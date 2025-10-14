import mongoose from "mongoose";

import { Cron, type RegisterCronOptions } from "./internal/cron";
import {
  type EnqueueOptions,
  JobsRepository,
  type SessionOptions,
} from "./internal/jobsRepository";
import type { Logger } from "./internal/logger";
import { defaultMetricsReporter, Metrics, type MetricsReporter } from "./internal/metrics";
import {
  type AnyHandlerClassOrInstance,
  type InstantiableHandlerClassOrInstance,
  Registry,
} from "./internal/registry";
import { Worker, type WorkerOptions } from "./internal/worker";
import { BackgroundJobSchema, BackgroundJobSchemaName, type BackgroundJobType } from "./job";
import { ScheduleSchema, ScheduleSchemaName, type ScheduleType } from "./schedule";

export interface ConstructorOptions {
  logger?: Logger;
  dbConnection?: mongoose.Connection;
  metricsReporter?: MetricsReporter;
  allowHandlerOverride?: boolean;
}

export class BackgroundJobsService {
  public readonly jobModel: mongoose.Model<BackgroundJobType<unknown>>;
  public readonly scheduleModel: mongoose.Model<ScheduleType<unknown>>;
  public readonly jobsRepo: JobsRepository;
  public readonly registry: Registry;
  private readonly logger: Logger | undefined;
  private readonly connection: mongoose.Connection;
  private readonly metrics: Metrics;
  private readonly cron: Cron;
  private worker?: Worker;

  public constructor(options: ConstructorOptions = {}) {
    this.logger = options.logger;
    this.connection = options.dbConnection ?? mongoose.connection;
    this.jobModel = this.connection.model<BackgroundJobType<unknown>>(
      BackgroundJobSchemaName,
      BackgroundJobSchema,
    );
    this.scheduleModel = this.connection.model<ScheduleType<unknown>>(
      ScheduleSchemaName,
      ScheduleSchema,
    );

    this.registry = new Registry({ allowHandlerOverride: options.allowHandlerOverride });

    const metricsReporter = options.metricsReporter ?? defaultMetricsReporter();
    this.metrics = new Metrics(metricsReporter, this.jobModel, this.registry);

    this.jobsRepo = new JobsRepository({ jobModel: this.jobModel, registry: this.registry });
    this.cron = new Cron({
      registry: this.registry,
      scheduleModel: this.scheduleModel,
      jobsRepo: this.jobsRepo,
    });
  }

  public register<T>(
    handlerClassOrInstance: InstantiableHandlerClassOrInstance<T>,
    group: string,
  ): void {
    this.registry.register(handlerClassOrInstance, group);
  }

  public async registerCron<T>(
    handlerClassOrInstance: InstantiableHandlerClassOrInstance<T>,
    options: RegisterCronOptions<T>,
  ): Promise<void> {
    await this.cron.registerCron(handlerClassOrInstance, options);
  }

  public async enqueue<T>(
    handlerClassOrInstance: string | AnyHandlerClassOrInstance<T>,
    data: T,
    options: EnqueueOptions = {},
  ): Promise<BackgroundJobType<T> | undefined> {
    return await this.jobsRepo.createJob({
      handler: handlerClassOrInstance,
      data,
      ...options,
    });
  }

  public async removeCron(scheduleName: string) {
    await this.cron.removeCron(scheduleName);
  }

  public async start(groups: string[], workerOptions: WorkerOptions = {}) {
    if (this.worker && !this.worker.stopped) {
      throw new Error("BackgroundJobs currently running");
    }

    this.worker = this.buildWorker(groups, workerOptions);

    await this.worker.start();
    await this.metrics.startReporting();
  }

  public buildWorker(groups: string[], workerOptions: WorkerOptions) {
    return new Worker({
      groups,
      cron: this.cron,
      registry: this.registry,
      logger: this.logger,
      metrics: this.metrics,
      jobsRepo: this.jobsRepo,
      ...workerOptions,
    });
  }

  public async stop(waitTime?: number) {
    await this.worker?.stop(waitTime);
  }

  public async getJobById(jobId: string) {
    const jobObjectId = new mongoose.Types.ObjectId(jobId);
    return await this.jobsRepo.getJob(jobObjectId);
  }

  /**
   * Retry a job by id
   *
   * This method is useful if you have a job that exhausted its attempts limit
   * but you want to run it again. By calling this method you will bring the
   * attempts count of the job to 0 and set the next run time to current time
   * (so the job will be picked up as soon as possible).
   **/
  public async retryJobById(jobId: string) {
    const jobObjectId = new mongoose.Types.ObjectId(jobId);
    await this.jobsRepo.resetJob(jobObjectId);
  }

  /**
   * Cancel jobs
   *
   * This method will remove jobs with given ids from the DB. So if the job is
   * scheduled and waiting to be run then you would prevent the job from being
   * executed in the future. If you call this method while the job is currently
   * running then you won't affect the current execution of the job but you
   * will prevent the job from being executed again in the future (in case it
   * failed)
   **/
  public async cancel(jobIds: string[], options: SessionOptions = {}) {
    const jobObjectIds = jobIds.map((jobId) => new mongoose.Types.ObjectId(jobId));
    await this.jobsRepo.deleteJobs(jobObjectIds, options);
  }
}
