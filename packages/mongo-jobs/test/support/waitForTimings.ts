import { setTimeout } from "node:timers/promises";

import { type TestMetricsReporter } from "./testMetricsReporter";

export async function waitForTimings(
  metricsReporter: TestMetricsReporter,
  queue: string,
  metric: string,
  expectedCount: number,
): Promise<number[]> {
  const timeoutMillis = 5000;
  const timeoutAt = Date.now() + timeoutMillis;

  for (;;) {
    const timings = metricsReporter.timingFor(queue, metric);

    if (timings && timings.length >= expectedCount) {
      return timings;
    }

    if (Date.now() >= timeoutAt) {
      throw new Error(
        `Timed out waiting for ${expectedCount} ${metric} timings for queue ${queue}, found ${timings?.length ?? 0}`,
      );
    }

    // eslint-disable-next-line no-await-in-loop
    await setTimeout(10);
  }
}
