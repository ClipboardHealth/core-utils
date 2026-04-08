import { setTimeout } from "node:timers/promises";

import type mongoose from "mongoose";

import { type BackgroundJobs, type BackgroundJobType } from "../../src";

interface WaitForJobCountOptions {
  backgroundJobs: BackgroundJobs;
  expectedCount: number;
  description: string;
  query?: mongoose.FilterQuery<BackgroundJobType<unknown>>;
  timeoutMilliseconds?: number;
}

export async function waitForJobCount(options: WaitForJobCountOptions): Promise<number> {
  const {
    backgroundJobs,
    expectedCount,
    description,
    query = {},
    timeoutMilliseconds = 15_000,
  } = options;
  const timeoutAt = Date.now() + timeoutMilliseconds;

  for (;;) {
    // eslint-disable-next-line no-await-in-loop
    const jobCount = await backgroundJobs.jobModel.countDocuments(query);

    if (jobCount === expectedCount) {
      return jobCount;
    }

    if (Date.now() >= timeoutAt) {
      throw new Error(
        `Timed out waiting for ${description} count to equal ${expectedCount}, found ${jobCount}`,
      );
    }

    // eslint-disable-next-line no-await-in-loop
    await setTimeout(10);
  }
}
