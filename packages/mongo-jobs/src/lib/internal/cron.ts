import { CronExpressionParser } from "cron-parser";
import type mongoose from "mongoose";

import type { BackgroundJobType } from "../job";
import type { ScheduleType } from "../schedule";
import { HandlerAlreadyRegisteredError } from "./handlerAlreadyRegisteredError";
import type { JobsRepository } from "./jobsRepository";
import type { InstantiableHandlerClassOrInstance, Registry } from "./registry";

interface ConstructorOptions {
  scheduleModel: mongoose.Model<ScheduleType<unknown>>;
  jobsRepo: JobsRepository;
  registry: Registry;
}

export interface RegisterCronOptions<T> {
  group: string;
  cronExpression: string;
  timeZone?: string;
  scheduleName: string;
  data: T;
}

function validateCronExpression(expression: string) {
  try {
    CronExpressionParser.parse(expression);
  } catch (error) {
    throw new Error("Invalid cron expression", { cause: error });
  }
}

export class Cron {
  private readonly scheduleModel: mongoose.Model<ScheduleType<unknown>>;
  private readonly jobsRepo: JobsRepository;
  private readonly registry: Registry;

  constructor(options: ConstructorOptions) {
    this.scheduleModel = options.scheduleModel;
    this.jobsRepo = options.jobsRepo;
    this.registry = options.registry;
  }

  public async maybeScheduleNextJob(job: BackgroundJobType<unknown>) {
    if (!job.scheduleName) {
      return;
    }

    if (job.attemptsCount > 0) {
      return;
    }

    const schedule = await this.scheduleModel.findOne({ name: job.scheduleName });
    if (schedule) {
      await this.scheduleNextIteration(schedule);
    }
  }

  public async registerCron<T>(
    handlerClassOrInstance: InstantiableHandlerClassOrInstance<T>,
    options: RegisterCronOptions<T>,
  ): Promise<void> {
    try {
      this.registry.register(handlerClassOrInstance, options.group);
    } catch (error) {
      if (!(error instanceof HandlerAlreadyRegisteredError)) {
        throw error;
      }
    }

    const { handler, queue } = this.registry.getRegisteredHandler(handlerClassOrInstance);
    await this.upsertSchedule(handler.name, queue, options);
  }

  public async scheduleNextIteration(schedule: Omit<ScheduleType<unknown>, "_id">) {
    const nextRunAt = CronExpressionParser.parse(schedule.cronExpression, { tz: schedule.timeZone })
      .next()
      .toDate();
    const nextRunAtInteger = nextRunAt.getTime();
    const uniqueKey = `${schedule.name}-${nextRunAtInteger}`;

    await this.jobsRepo.createJob({
      handler: schedule.handlerName,
      data: schedule.data,
      startAt: nextRunAt,
      unique: uniqueKey,
      scheduleName: schedule.name,
      queue: schedule.queue,
    });
  }

  public async removeCron(scheduleName: string) {
    await this.scheduleModel.deleteOne({ name: scheduleName });
    await this.jobsRepo.deleteUpcomingScheduleJobs(scheduleName);
  }

  private async upsertSchedule<T>(
    handlerName: string,
    queue: string,
    options: RegisterCronOptions<T>,
  ) {
    const { scheduleName, cronExpression, data } = options;
    const timeZone = options.timeZone ?? "utc";

    validateCronExpression(cronExpression);

    const scheduleAttributes = {
      name: scheduleName,
      handlerName,
      cronExpression,
      timeZone,
      queue,
      data,
    };

    const upsertResult = await this.scheduleModel.updateOne(
      { name: scheduleName },
      { $set: scheduleAttributes },
      { upsert: true },
    );

    if (upsertResult.modifiedCount > 0) {
      /* If the schedule is updated then we are clearing all future jobs for this schedule
       * so that we can reschedule them with proper timing/handler etc
       */
      await this.jobsRepo.deleteUpcomingScheduleJobs(scheduleName);
    }

    await this.scheduleNextIteration(scheduleAttributes);
  }
}
