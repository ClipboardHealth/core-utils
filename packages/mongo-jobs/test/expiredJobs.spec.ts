import { setTimeout } from "node:timers/promises";

import type { BackgroundJobsService } from "@clipboard-health/mongo-jobs";

import { ensureExistence } from "./support/ensureExistence";
import { ExampleJob } from "./support/exampleJob";
import { JobRun } from "./support/jobRun";
import { createTestContext, type TestContext } from "./support/testContext";
import { TestLogger } from "./support/testLogger";
import { TestMetricsReporter } from "./support/testMetricsReporter";

describe("Expired Jobs", () => {
  let testContext: TestContext;
  let backgroundJobs: BackgroundJobsService;
  let logger: TestLogger;
  let metricsReporter: TestMetricsReporter;

  beforeEach(async () => {
    logger = new TestLogger();
    metricsReporter = new TestMetricsReporter();
    testContext = await createTestContext({ logger, metricsReporter });
    backgroundJobs = testContext.backgroundJobs;

    backgroundJobs.register(ExampleJob, "default");
  });

  afterEach(async () => {
    await testContext.tearDown();
  });

  it("jobs that are expired are being unlocked so that they can be processed again and we log and report metrics for that", async () => {
    const expiredJob1 = ensureExistence(
      await backgroundJobs.enqueue(ExampleJob, { myNumber: 100 }),
    );
    // Normal not-locked job
    ensureExistence(await backgroundJobs.enqueue(ExampleJob, { myNumber: 200 }));
    const notYetExpiredJob = ensureExistence(
      await backgroundJobs.enqueue(ExampleJob, { myNumber: 300 }),
    );
    const expiredJob2 = ensureExistence(
      await backgroundJobs.enqueue(ExampleJob, { myNumber: 400 }),
    );

    await backgroundJobs.jobModel.updateOne(
      { _id: expiredJob1._id },
      { lockedAt: new Date(Date.now() - 610_000) },
    );
    await backgroundJobs.jobModel.updateOne(
      { _id: expiredJob2._id },
      { lockedAt: new Date(Date.now() - 620_000) },
    );
    await backgroundJobs.jobModel.updateOne(
      { _id: notYetExpiredJob._id },
      { lockedAt: new Date(Date.now() - 10_000) },
    );

    void backgroundJobs.start(["default"]);
    await setTimeout(100);
    await backgroundJobs.stop();

    expect(await backgroundJobs.jobModel.countDocuments()).toBe(1);

    const jobRuns = await JobRun.find({});
    const jobRunNumbers = jobRuns.map((jobRun) => jobRun.myNumber);
    expect(jobRunNumbers).toHaveLength(3);
    expect(jobRunNumbers).toContain(100);
    expect(jobRunNumbers).toContain(200);
    expect(jobRunNumbers).toContain(400);

    expect(metricsReporter.metricFor("ExampleJob", "expired")).toBe(2);
    expect(logger.errorLogs).toHaveLength(2);

    const loggedJobIds = logger.errorLogs.map((entry) => entry.context["jobId"]);
    expect(loggedJobIds).toContain(expiredJob1._id.toString());
    expect(loggedJobIds).toContain(expiredJob2._id.toString());
  });
});
