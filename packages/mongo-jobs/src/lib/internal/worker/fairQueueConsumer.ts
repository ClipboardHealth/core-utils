import type { ChangeStream } from "mongodb";

import type { BackgroundJobType } from "../../job";
import { type JobsRepository, type UpsertChangeStreamEvent } from "../jobsRepository";
import { ActionableQueues } from "./actionableQueues";
import { FutureQueues } from "./futureQueues";
import type { QueueConsumer, QueueConsumerStartOptions } from "./queueConsumer";

export class FairQueueConsumer extends EventTarget implements QueueConsumer {
  private readonly jobsRepository: JobsRepository;
  private readonly consumedQueues: string[];
  private readonly consumedQueuesSet: Set<string>;
  private readonly actionableQueues = new ActionableQueues();
  private readonly futureQueues = new FutureQueues();
  private jobsChangeStream?: ChangeStream<BackgroundJobType<unknown>>;
  private refreshQueuesInterval?: NodeJS.Timeout;

  constructor(queues: string[], jobsRepository: JobsRepository) {
    super();
    this.consumedQueues = queues;
    this.consumedQueuesSet = new Set(queues);
    this.jobsRepository = jobsRepository;
  }

  async start({ useChangeStream, refreshQueuesIntervalMS }: QueueConsumerStartOptions) {
    if (this.consumedQueues.length === 0) {
      return;
    }

    await this.startQueuesRefresh(refreshQueuesIntervalMS);

    if (useChangeStream && !this.jobsChangeStream) {
      this.startListeningForQueueChanges();
    }
  }

  async startQueuesRefresh(interval: number) {
    await this.refreshActionableQueuesFromDB();
    this.refreshQueuesInterval = setInterval(async () => {
      await this.refreshActionableQueuesFromDB();
    }, interval);
  }

  startListeningForQueueChanges() {
    this.jobsChangeStream = this.jobsRepository.watchUpserts(this.consumedQueues);

    this.jobsChangeStream.on("change", (event: unknown) => {
      const typedEvent = event as UpsertChangeStreamEvent;
      const queue = typedEvent.fullDocument?.queue;
      const nextRunAt = typedEvent.fullDocument?.nextRunAt;
      const lockedAt = typedEvent.fullDocument?.lockedAt;

      if (
        queue === undefined ||
        nextRunAt === undefined ||
        !this.consumedQueuesSet.has(queue) ||
        lockedAt !== undefined
      ) {
        return;
      }

      this.futureQueues.setActionableAt(queue, nextRunAt);
      this.dispatchNewJobEvent();
    });
  }

  async stop() {
    if (this.refreshQueuesInterval) {
      clearInterval(this.refreshQueuesInterval);
    }

    if (this.jobsChangeStream) {
      this.jobsChangeStream.removeAllListeners();
      try {
        await this.jobsChangeStream.close();
      } catch {
        // Might already be closed
      }
    }
  }

  async refreshActionableQueuesFromDB() {
    const queues = await this.jobsRepository.fetchQueuesWithJobs(this.consumedQueues);
    for (const queue of queues) {
      /**
       * Not adding "undefined" into actionable queues - those are jobs that were failed and were
       * taken off of their respective queues
       **/
      if (queue) {
        this.actionableQueues.add(queue);
      }
    }
  }

  async acquireNextJob(): Promise<BackgroundJobType<unknown> | undefined> {
    this.promoteQueues();
    let job;

    while (!job) {
      const queue = this.actionableQueues.getRandom();

      if (queue === undefined) {
        return undefined;
      }

      // eslint-disable-next-line no-await-in-loop
      job = await this.jobsRepository.fetchAndLockNextJob([queue]);

      if (!job) {
        // eslint-disable-next-line no-await-in-loop
        await this.removeQueueFromActionable(queue);
      }
    }

    return job;
  }

  getConsumedQueues(): string[] {
    return [...this.consumedQueues];
  }

  private promoteQueues() {
    const queuesToPromote = this.futureQueues.acquireCurrentlyActionable();
    for (const queue of queuesToPromote) {
      this.actionableQueues.add(queue);
    }
  }

  private async removeQueueFromActionable(queue: string) {
    this.actionableQueues.remove(queue);
    void this.refreshQueueFutureActionableAt(queue);
  }

  private async refreshQueueFutureActionableAt(queue: string) {
    const job = await this.jobsRepository.fetchNextJob(queue);

    if (!job) {
      return;
    }

    const { nextRunAt } = job;

    if (!nextRunAt) {
      return;
    }

    this.futureQueues.setActionableAt(queue, nextRunAt);
    if (nextRunAt < new Date()) {
      this.dispatchNewJobEvent();
    }
  }

  private dispatchNewJobEvent() {
    this.dispatchEvent(new Event("newJob"));
  }
}
