import { setTimeout } from "node:timers/promises";

import { type TestMetricsReporter } from "./testMetricsReporter";

export async function waitForMetric(
  metricsReporter: TestMetricsReporter,
  queue: string,
  metric: string,
  expectedValue: number,
): Promise<number> {
  const timeoutMilliseconds = 15_000;
  const timeoutAt = Date.now() + timeoutMilliseconds;

  for (;;) {
    const metricValue = metricsReporter.metricFor(queue, metric);

    if (metricValue === expectedValue) {
      return metricValue;
    }

    if (Date.now() >= timeoutAt) {
      throw new Error(
        `Timed out waiting for ${queue} ${metric} metric to equal ${expectedValue}, found ${metricValue ?? "undefined"}`,
      );
    }

    // eslint-disable-next-line no-await-in-loop
    await setTimeout(10);
  }
}
