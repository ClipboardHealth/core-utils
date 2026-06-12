/* eslint-disable no-await-in-loop */
import type { BackgroundJobs } from "./backgroundJobs";
import type { AnyHandlerClass } from "./internal/registry";
import type { Worker } from "./internal/worker";

interface DrainOptions {
  jobsScheduledUntil?: Date;
  recursive?: boolean;
}

async function executeJobs(
  backgroundJobs: BackgroundJobs,
  worker: Worker,
  queues: string[],
  options: DrainOptions = {},
) {
  for (;;) {
    const pendingJobs = await backgroundJobs.jobModel.find({
      nextRunAt: { $lte: options.jobsScheduledUntil ?? new Date() },
      queue: { $in: queues },
    });

    if (pendingJobs.length === 0) {
      return;
    }

    for (const job of pendingJobs) {
      await worker.updateUniqueKey(job);
      await worker.runJobHandler(job);
      await worker.markJobCompleted(job);
    }

    if (options.recursive === false) {
      return;
    }
  }
}

// Drain jobs for all queues in given groups
export async function drainQueues(
  backgroundJobs: BackgroundJobs,
  groups: string[],
  options: DrainOptions = {},
) {
  const worker = backgroundJobs.buildWorker(groups, { useChangeStream: false });
  const consumedQueues = worker.getConsumedQueues();

  await executeJobs(backgroundJobs, worker, consumedQueues, options);
}

// Drain jobs for given handlers
export async function drainHandlers(
  backgroundJobs: BackgroundJobs,
  handlers: Array<AnyHandlerClass<unknown> | string>,
  options: DrainOptions = {},
) {
  const queues = handlers.map(
    (handler) => backgroundJobs.registry.getRegisteredHandler(handler).queue,
  );
  const worker = backgroundJobs.buildWorker([], { useChangeStream: false });

  await executeJobs(backgroundJobs, worker, queues, options);
}
/* eslint-enable no-await-in-loop */
