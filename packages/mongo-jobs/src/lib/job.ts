import mongoose from "mongoose";

import type { TraceHeaders } from "./tracing";

export interface JobUniqueOptions {
  enqueuedKey: string | undefined;
  runningKey: string | undefined;
}

interface JobOptions {
  unique?: JobUniqueOptions;
}

export interface BackgroundJobType<T> {
  _id: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;

  queue: string;
  handlerName: string;
  data: T & TraceHeaders;

  nextRunAt: Date | undefined;
  lockedAt: Date | undefined;
  failedAt: Date | undefined;
  attemptsCount: number;
  lastError: string | undefined;

  options: JobOptions | undefined;
  uniqueKey: string | undefined;
  scheduleName: string | undefined;
  // When the job is failed we take it off from the regular queue and put that queue
  // Here in case someone wants to put it back in the queue using `resetJob`
  originalQueue: string | undefined;
}

export const BackgroundJobSchemaName = "BackgroundJob";

const BackgroundJobSchema = new mongoose.Schema<BackgroundJobType<unknown>>(
  {
    queue: String,
    handlerName: String,
    data: {},
    nextRunAt: Date,
    lockedAt: Date,
    failedAt: Date,
    attemptsCount: { type: Number, default: 0 },
    lastError: String,
    options: {},
    uniqueKey: String,
    scheduleName: String,
    originalQueue: String,
  },
  {
    timestamps: true,
  },
);

BackgroundJobSchema.index({ queue: 1, lockedAt: 1, nextRunAt: 1 });
BackgroundJobSchema.index({ failedAt: 1, lockedAt: 1 });
BackgroundJobSchema.index({ originalQueue: 1, failedAt: 1 });
BackgroundJobSchema.index({ uniqueKey: 1 }, { unique: true, sparse: true });
BackgroundJobSchema.index({ scheduleName: 1 });

export { BackgroundJobSchema };
