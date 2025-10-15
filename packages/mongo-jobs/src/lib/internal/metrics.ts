import StatsD, { type ClientOptions } from "hot-shots";
import type mongoose from "mongoose";

import type { BackgroundJobType } from "../job";
import { withInternalsTrace } from "../tracing";
import type { Registry } from "./registry";

const REPORTING_PERIOD_MILLIS = 60_000;

export interface MetricsReporter {
  gauge(name: string, value: number, tags: Record<string, string>): void;
  increment(name: string, tags: Record<string, string>): void;
  timing(name: string, value: number | Date, tags: Record<string, string>): void;
}

/**
 * Create a StatsD reporter.
 */
export function defaultMetricsReporter(options: ClientOptions = {}): MetricsReporter {
  return new StatsD({ ...options, prefix: "background_jobs." });
}

export class Metrics {
  private reportingInterval?: NodeJS.Timeout;
  private started = false;
  private reporting = false;

  constructor(
    private readonly reporter: MetricsReporter,
    private readonly jobModel: mongoose.Model<BackgroundJobType<unknown>>,
    private readonly registry: Registry,
  ) {}

  public async startReporting() {
    if (this.started) {
      return;
    }

    this.started = true;

    void this.reportMetrics();

    this.reportingInterval = setInterval(async () => {
      await this.reportMetrics();
    }, REPORTING_PERIOD_MILLIS);
  }

  public stopReporting() {
    this.started = false;
    clearInterval(this.reportingInterval);
  }

  public async reportMetrics() {
    if (!this.started || this.reporting) {
      return;
    }

    this.reporting = true;

    /* Reporting for each queue separate instead of having 1 query that
     * calculates given state for all queues at once (with groupBy) because
     * during testing it seemed that having queries per each queue was
     * collectively faster than doing one big query (tested with ~1 million
     * jobs in DB)
     */
    try {
      await withInternalsTrace("reportMetrics", async () => {
        await Promise.all(
          this.registry.getQueues().map(async (queue) => {
            // Scheduled jobs - jobs who have nextRunAt in the future
            const scheduledCount = await this.reportQueueMetric(
              queue,
              "scheduled",
              this.scheduledJobsQuery(queue),
            );

            // Pending jobs - jobs ready to be processed (nextRunAt is in the past/present)
            const pendingCount = await this.reportQueueMetric(
              queue,
              "pending",
              this.pendingJobsQuery(queue),
            );

            // Failed jobs - those that reached the limit of retries and won't be retried again
            await this.reportQueueMetric(queue, "failed", this.failedJobsQuery(queue));

            // Created jobs - scheduled + pending - reporting to be consistent with pg-boss/postgres background jobs
            this.sendGaugeMetric(queue, "created", scheduledCount + pendingCount);
          }),
        );
      });
    } finally {
      this.reporting = false;
    }
  }

  public increment(queue: string, state: string) {
    this.reporter.increment(`queue.${state}`, { queue });
  }

  public timing(queue: string, metric: string, value: Date | number) {
    this.reporter.timing(`queue.${metric}`, value, { queue });
  }

  private async reportQueueMetric(
    queue: string,
    state: string,
    query: mongoose.FilterQuery<BackgroundJobType<unknown>>,
  ) {
    const count = await this.jobModel.countDocuments(query);
    this.sendGaugeMetric(queue, state, count);
    return count;
  }

  private sendGaugeMetric(queue: string, state: string, value: number) {
    this.reporter.gauge(`queue.${state}`, value, { queue });
  }

  private scheduledJobsQuery(queue: string): mongoose.FilterQuery<BackgroundJobType<unknown>> {
    return {
      queue,
      nextRunAt: { $gt: new Date() },
      lockedAt: null,
    };
  }

  private pendingJobsQuery(queue: string): mongoose.FilterQuery<BackgroundJobType<unknown>> {
    return {
      queue,
      nextRunAt: { $lte: new Date() },
      lockedAt: null,
    };
  }

  private failedJobsQuery(queue: string) {
    return {
      originalQueue: queue,
      failedAt: { $ne: null },
    };
  }
}
