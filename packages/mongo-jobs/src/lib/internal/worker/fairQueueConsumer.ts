import type { ChangeStream } from "mongodb";

import type { BackgroundJobType } from "../../job";
import type { JobsRepository, UpsertChangeStreamEvent } from "../jobsRepository";
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

  public constructor(queues: string[], jobsRepository: JobsRepository) {
    super();
    this.consumedQueues = queues;
    this.consumedQueuesSet = new Set(queues);
    this.jobsRepository = jobsRepository;
  }

  public async start({ useChangeStream, refreshQueuesIntervalMS }: QueueConsumerStartOptions) {
    if (this.consumedQueues.length === 0) {
      return;
    }

    await this.startQueuesRefresh(refreshQueuesIntervalMS);

    if (useChangeStream && !this.jobsChangeStream) {
      this.startListeningForQueueChanges();
    }
  }

  public async startQueuesRefresh(interval: number) {
    await this.refreshActionableQueuesFromDB();
    this.refreshQueuesInterval = setInterval(() => {
      this.refreshActionableQueuesFromDBSafely();
    }, interval);
  }

  public startListeningForQueueChanges() {
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

  public async stop() {
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

  public async refreshActionableQueuesFromDB() {
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

  public async acquireNextJob(): Promise<BackgroundJobType<unknown> | undefined> {
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

  public getConsumedQueues(): string[] {
    return [...this.consumedQueues];
  }

  private refreshActionableQueuesFromDBSafely(): void {
    void (async () => {
      try {
        await this.refreshActionableQueuesFromDB();
      } catch {
        // Ignore rejections from detached queue refreshes.
      }
    })();
  }

  private promoteQueues() {
    const queuesToPromote = this.futureQueues.acquireCurrentlyActionable();
    for (const queue of queuesToPromote) {
      this.actionableQueues.add(queue);
    }
  }

  private async removeQueueFromActionable(queue: string) {
    this.actionableQueues.remove(queue);
    this.refreshQueueFutureActionableAtSafely(queue);
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

  private refreshQueueFutureActionableAtSafely(queue: string): void {
    void (async () => {
      try {
        await this.refreshQueueFutureActionableAt(queue);
      } catch {
        // Ignore rejections from detached queue future refreshes.
      }
    })();
  }

  private dispatchNewJobEvent() {
    this.dispatchEvent(new Event("newJob"));
  }
}
