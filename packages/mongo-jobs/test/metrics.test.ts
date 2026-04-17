import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { BackgroundJobs, type BackgroundJobType } from "../src";
import { ExampleJob } from "./support/exampleJob";
import { FailingJob } from "./support/failingJob";
import { createTestContext, type TestContext } from "./support/testContext";
import { TestMetricsReporter } from "./support/testMetricsReporter";
import { waitForJobCount } from "./support/waitForJobCount";
import { waitForMetric } from "./support/waitForMetric";
import { waitForTimings } from "./support/waitForTimings";

describe("BackgroundJobMetrics", () => {
  let testContext: TestContext;
  let backgroundJobs: BackgroundJobs;
  let metricsReporter: TestMetricsReporter;

  beforeEach(async () => {
    testContext = await createTestContext();
    metricsReporter = new TestMetricsReporter();
    backgroundJobs = new BackgroundJobs({ metricsReporter });

    backgroundJobs.register(ExampleJob, "default");
    backgroundJobs.register(FailingJob, "default");
  });

  afterEach(async () => {
    await backgroundJobs.stop();
    await testContext.tearDown();
  });

  it("reports a pending job", async () => {
    await backgroundJobs.enqueue(ExampleJob, { myNumber: 123 });

    await backgroundJobs.start(["other_group"]); // Consuming other group so that the default group won't get consumed before metrics are reported

    await waitForMetric(metricsReporter, "ExampleJob", "created", 1);
    await backgroundJobs.stop();

    expect(metricsReporter.metricFor("ExampleJob", "pending")).toBe(1);
    expect(metricsReporter.metricFor("ExampleJob", "scheduled")).toBe(0);
    expect(metricsReporter.metricFor("ExampleJob", "failed")).toBe(0);
    expect(metricsReporter.metricFor("ExampleJob", "created")).toBe(1);
  });

  it("reports a scheduled job", async () => {
    await backgroundJobs.enqueue(
      ExampleJob,
      { myNumber: 123 },
      { startAt: new Date(Date.now() + 60_000) },
    );

    await backgroundJobs.start(["default"]);
    await waitForMetric(metricsReporter, "ExampleJob", "created", 1);
    await backgroundJobs.stop();

    expect(metricsReporter.metricFor("ExampleJob", "pending")).toBe(0);
    expect(metricsReporter.metricFor("ExampleJob", "scheduled")).toBe(1);
    expect(metricsReporter.metricFor("ExampleJob", "failed")).toBe(0);
    expect(metricsReporter.metricFor("ExampleJob", "created")).toBe(1);
  });

  it("reports a failed job", async () => {
    const job = await backgroundJobs.enqueue(FailingJob, { myNumber: 123 });

    expect(job).toBeDefined();

    await backgroundJobs.jobModel.updateOne(
      { _id: (job as BackgroundJobType<unknown>)._id },
      { attemptsCount: 10 },
    );

    await backgroundJobs.start(["default"]);
    await waitForJobCount({
      backgroundJobs,
      expectedCount: 1,
      description: "failed background jobs",
      query: {
        _id: (job as BackgroundJobType<unknown>)._id,
        failedAt: { $exists: true, $ne: null },
      },
    });
    await backgroundJobs.stop();

    // Running again to make sure that the job failed and will be reported as failed
    await backgroundJobs.start(["default"]);
    await waitForMetric(metricsReporter, "FailingJob", "failed", 1);
    await backgroundJobs.stop();

    expect(metricsReporter.metricFor("FailingJob", "pending")).toBe(0);
    expect(metricsReporter.metricFor("FailingJob", "scheduled")).toBe(0);
    expect(metricsReporter.metricFor("FailingJob", "failed")).toBe(1);
    expect(metricsReporter.metricFor("FailingJob", "created")).toBe(0);
  });

  it("reports a retry", async () => {
    await backgroundJobs.enqueue(FailingJob, { myNumber: 123 });

    await backgroundJobs.start(["default"]);
    await waitForMetric(metricsReporter, "FailingJob", "retry", 1);
    await backgroundJobs.stop();

    expect(metricsReporter.metricFor("FailingJob", "retry")).toBe(1);
  });

  it("reports an execution delay of the job", async () => {
    // Job scheduled for 5 seconds ago
    await backgroundJobs.enqueue(
      ExampleJob,
      { myNumber: 123 },
      { startAt: new Date(Date.now() - 5000) },
    );
    // Job scheduled for now
    await backgroundJobs.enqueue(ExampleJob, { myNumber: 555 });

    await backgroundJobs.start(["default"]);

    const reportedTimings = await waitForTimings(metricsReporter, "ExampleJob", "delay", 2);

    await backgroundJobs.stop();

    expect(reportedTimings).toHaveLength(2);

    // First job reported delay should be ~5s with reasonable tolerance for overhead
    expect(reportedTimings[0]).toBeGreaterThanOrEqual(5000);
    expect(reportedTimings[0]).toBeLessThan(5200);

    // Second job reported delay should be small but allow for reasonable overhead
    expect(reportedTimings[1]).toBeGreaterThanOrEqual(0);
    expect(reportedTimings[1]).toBeLessThan(200);
  });
});
