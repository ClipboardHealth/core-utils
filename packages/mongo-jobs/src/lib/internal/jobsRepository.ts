import type { ChangeStream, ClientSession } from "mongodb";
import type mongoose from "mongoose";

import type { BackgroundJobType, JobUniqueOptions } from "../job";
import { withInternalsTrace, withProducerTrace } from "../tracing";
import { isMongoDuplicateError } from "./mongoDuplicate";
import type { AnyHandlerClassOrInstance, RegisteredHandlerType, Registry } from "./registry";

type EnqueueUniqueOptions = string | JobUniqueOptions;

export interface UpsertChangeStreamEvent {
  fullDocument: BackgroundJobType<unknown>;
}

export interface SessionOptions {
  session?: ClientSession;
}

export interface EnqueueOptions extends SessionOptions {
  startAt?: Date;
  unique?: EnqueueUniqueOptions;
}

interface CreateJobParameters<T> extends EnqueueOptions {
  handler: string | AnyHandlerClassOrInstance<T>;
  data: T;
  scheduleName?: string;
  queue?: string;
}

interface ConstructorOptions {
  registry: Registry;
  jobModel: mongoose.Model<BackgroundJobType<unknown>>;
}

function normalizeUniqueOptions(
  options: EnqueueUniqueOptions | undefined,
): JobUniqueOptions | undefined {
  if (typeof options === "string") {
    return {
      enqueuedKey: options,
      runningKey: options,
    };
  }

  return options;
}

export class JobsRepository {
  private readonly registry: Registry;
  private readonly jobModel: mongoose.Model<BackgroundJobType<unknown>>;

  constructor(options: ConstructorOptions) {
    this.registry = options.registry;
    this.jobModel = options.jobModel;
  }

  public async createJob<T>(parameters: CreateJobParameters<T>) {
    const handlerClassOrInstance = parameters.handler;
    const registeredHandler = this.registry.getRegisteredHandler(
      handlerClassOrInstance,
    ) as unknown as RegisteredHandlerType<T>;

    const { handler } = registeredHandler;
    const queue = parameters.queue ?? registeredHandler.queue;
    const { session, unique, scheduleName, data } = parameters;
    const startAt = parameters.startAt ?? new Date();
    const uniqueOptions = normalizeUniqueOptions(unique);
    const uniqueKey = uniqueOptions?.enqueuedKey;

    return await withProducerTrace(handler, data, async (dataWithTrace) => {
      try {
        const backgroundJobCreateResult = await this.jobModel.create(
          [
            {
              handlerName: handler.name,
              data: dataWithTrace,
              nextRunAt: startAt,
              queue,
              ...(scheduleName && { scheduleName }),
              ...(uniqueOptions && { options: { unique: uniqueOptions } }),
              ...(uniqueKey && { uniqueKey }),
            },
          ],
          { session },
        );

        const createdJob = backgroundJobCreateResult[0];
        return createdJob as unknown as BackgroundJobType<T>;
      } catch (error) {
        if (isMongoDuplicateError(error)) {
          // eslint-disable-next-line consistent-return
          return;
        }

        throw error;
      }
    });
  }

  public async fetchAndLockNextJob(
    queues: string[],
  ): Promise<BackgroundJobType<unknown> | undefined> {
    return await withInternalsTrace("fetchAndLockNextJob", async () => {
      const acquiredJob = await this.jobModel
        .findOneAndUpdate(
          {
            queue: { $in: queues },
            lockedAt: null,
            nextRunAt: { $lte: new Date() },
          },
          {
            lockedAt: new Date(),
          },
          {
            sort: { nextRunAt: 1 },
            returnDocument: "after",
          },
        )
        .lean();

      return acquiredJob ?? undefined;
    });
  }

  public async fetchNextJob(queue: string): Promise<BackgroundJobType<unknown> | undefined> {
    return await withInternalsTrace("fetchNextJob", async () => {
      const job = await this.jobModel
        .findOne(
          {
            queue,
            lockedAt: null,
          },
          {},
          {
            sort: { nextRunAt: 1 },
          },
        )
        .lean();

      return job ?? undefined;
    });
  }

  public async updateOne(
    id: mongoose.Types.ObjectId,
    update: mongoose.UpdateQuery<BackgroundJobType<unknown>>,
  ) {
    await this.jobModel.updateOne({ _id: id }, update);
  }

  public async unlockFirstExpiredJob(lockedAtThreshold: Date) {
    const expiredJob = await this.jobModel.findOneAndUpdate(
      {
        failedAt: null,
        lockedAt: { $lt: lockedAtThreshold },
      },
      {
        $unset: {
          lockedAt: "",
        },
      },
      {
        sort: { lockedAt: 1 },
      },
    );

    return expiredJob ?? undefined;
  }

  public async deleteJobs(ids: mongoose.Types.ObjectId[], options?: SessionOptions) {
    if (ids.length === 0) {
      return;
    }

    await this.jobModel.deleteMany({ _id: { $in: ids } }, options);
  }

  public async getJob(id: mongoose.Types.ObjectId) {
    return await this.jobModel.findById(id);
  }

  public async deleteUpcomingScheduleJobs(scheduleName: string) {
    await this.jobModel.deleteMany({
      scheduleName,
      attemptsCount: 0,
      nextRunAt: { $gt: new Date() },
      lockedAt: null,
    });
  }

  public watchInserts(queues: string[]): ChangeStream<BackgroundJobType<unknown>> {
    return this.jobModel.watch([
      { $match: { operationType: "insert", "fullDocument.queue": { $in: queues } } },
    ]);
  }

  public watchUpserts(queues: string[]): ChangeStream<BackgroundJobType<unknown>> {
    return this.jobModel.watch(
      [
        {
          $match: {
            operationType: { $in: ["insert", "update"] },
            "fullDocument.queue": { $in: queues },
          },
        },
      ],
      { fullDocument: "updateLookup" },
    );
  }

  public async resetJob(id: mongoose.Types.ObjectId) {
    const existingJob = await this.getJob(id);

    if (!existingJob) {
      return;
    }

    const resetQuery: mongoose.UpdateQuery<BackgroundJobType<unknown>> = {
      $set: {
        nextRunAt: new Date(),
        attemptsCount: 0,
      },
      $unset: {
        failedAt: "",
        lockedAt: "",
      },
    };

    const enqueuedUniqueKey = existingJob.options?.unique?.enqueuedKey;

    if (enqueuedUniqueKey && resetQuery.$set) {
      resetQuery.$set.uniqueKey = enqueuedUniqueKey;
    }

    if (!existingJob.queue && !existingJob.originalQueue) {
      throw new Error("Job was taken off the queue but doesn't have value in originalQueue field");
    }

    if (!existingJob.queue && existingJob.originalQueue && resetQuery.$set) {
      resetQuery.$set.queue = existingJob.originalQueue;
    }

    await this.updateOne(id, resetQuery);
  }

  public async fetchQueuesWithJobs(pertinentQueues: string[]): Promise<string[]> {
    const queuesFilter = pertinentQueues ? { queue: { $in: pertinentQueues } } : {};

    return await this.jobModel.distinct("queue", queuesFilter);
  }
}
