import { setTimeout } from "node:timers/promises";

import { type BackgroundJobType, MongoJobs } from "../src";
import { createMongoConnection, createMongoSession } from "./support/connectToMongo";
import { dropDatabase } from "./support/dropDatabase";
import { EmptyExampleJob } from "./support/emptyExampleJob";
import { ensureExistence } from "./support/ensureExistence";
import { ExampleJob } from "./support/exampleJob";
import { FailingJob } from "./support/failingJob";
import { JobRun } from "./support/jobRun";
import { LongJob } from "./support/longJob";
import { NoRetryJob } from "./support/noRetryJob";
import { OtherQueueJob } from "./support/otherQueueJob";
import { Semaphore } from "./support/semaphore";
import { SemaphoreJob } from "./support/semaphoreJob";
import { createTestContext, type TestContext } from "./support/testContext";
import { TestLogger } from "./support/testLogger";

async function getMappedJobRuns() {
  const runs = await JobRun.find({}, {}, { sort: { _id: 1 } });
  return runs.map((run) => run.myNumber);
}

describe("Background Jobs Worker", () => {
  let testContext: TestContext;
  let backgroundJobs: MongoJobs;
  let testLogger: TestLogger;

  beforeEach(async () => {
    testLogger = new TestLogger();
    testContext = await createTestContext({ logger: testLogger });
    backgroundJobs = testContext.backgroundJobs;

    backgroundJobs.register(ExampleJob, "default");
    backgroundJobs.register(EmptyExampleJob, "default");
    backgroundJobs.register(FailingJob, "default");
    backgroundJobs.register(LongJob, "default");
    backgroundJobs.register(NoRetryJob, "default");
    backgroundJobs.register(OtherQueueJob, "other-queue");
  });

  afterEach(async () => {
    await testContext.tearDown();
  });

  it("can run a scheduled job", async () => {
    const myNumber = 5513;
    const job = await backgroundJobs.enqueue(ExampleJob, { myNumber });

    await backgroundJobs.start(["default"]);
    await setTimeout(100);
    await backgroundJobs.stop();

    expect(await backgroundJobs.jobModel.countDocuments()).toBe(0);
    expect(await JobRun.countDocuments()).toBe(1);

    const jobRun = await JobRun.findOne();
    expect(jobRun?.myNumber).toBe(myNumber);
    expect(jobRun?.meta).toMatchObject({ jobId: job?._id.toString() });
  });

  it("will pick up the first unlocked job", async () => {
    const job1 = await backgroundJobs.enqueue(
      ExampleJob,
      { myNumber: 111 },
      { startAt: new Date(Date.now() - 5000) },
    );
    const job2 = await backgroundJobs.enqueue(ExampleJob, { myNumber: 222 });

    await backgroundJobs.jobModel.updateOne({ _id: job1!._id }, { lockedAt: new Date() });

    await backgroundJobs.start(["default"]);
    await setTimeout(100);
    await backgroundJobs.stop();

    const jobRun = await JobRun.findOne();
    expect(jobRun?.myNumber).toBe(222);
    expect(jobRun?.meta).toMatchObject({ jobId: job2?._id.toString() });
  });

  it("can run a scheduled job using string", async () => {
    const myNumber = 5514;
    const jobName = "ExampleJob";
    const job = await backgroundJobs.enqueue(jobName, { myNumber });

    await backgroundJobs.start(["default"]);
    await setTimeout(100);
    await backgroundJobs.stop();

    expect(await backgroundJobs.jobModel.countDocuments()).toBe(0);
    expect(await JobRun.countDocuments()).toBe(1);

    const jobRun = await JobRun.findOne();
    expect(jobRun?.myNumber).toBe(myNumber);
    expect(jobRun?.meta).toMatchObject({ jobId: job?._id.toString() });
  });

  it("when the job is scheduled in a queue that the worker doesn't work on then the job won't be executed", async () => {
    await backgroundJobs.enqueue(ExampleJob, { myNumber: 111 });

    await backgroundJobs.start(["queue2"]);
    await setTimeout(100);
    await backgroundJobs.stop();

    expect(await backgroundJobs.jobModel.countDocuments()).toBe(1);
    expect(await JobRun.countDocuments()).toBe(0);

    const job = await backgroundJobs.jobModel.findOne();
    expect(job?.attemptsCount).toBe(0);
  });

  it("when the job is scheduled in the future then the worker won't execute that job", async () => {
    await backgroundJobs.enqueue(
      ExampleJob,
      { myNumber: 111 },
      { startAt: new Date(Date.now() + 10_000) },
    );

    await backgroundJobs.start(["default"]);
    await setTimeout(100);
    await backgroundJobs.stop();

    expect(await backgroundJobs.jobModel.countDocuments()).toBe(1);
    expect(await JobRun.countDocuments()).toBe(0);

    const job = await backgroundJobs.jobModel.findOne();
    expect(job?.attemptsCount).toBe(0);
  });

  it("is possible to handle jobs where data is empty", async () => {
    /* Mongoose is compacting db documents so that empty object is not
     * saved in DB at all. That was causing trouble with tracing so I'm
     * running a test for that
     */
    await backgroundJobs.enqueue(EmptyExampleJob, {});

    await backgroundJobs.start(["default"]);
    await setTimeout(100);
    await backgroundJobs.stop();

    expect(await backgroundJobs.jobModel.countDocuments()).toBe(0);
    expect(await JobRun.countDocuments()).toBe(1);

    const jobRun = await JobRun.findOne();
    expect(jobRun?.myNumber).toBe(0);
  });

  it("when the job fails it is rescheduled for later time", async () => {
    await backgroundJobs.enqueue(FailingJob, {});

    await backgroundJobs.start(["default"]);
    await setTimeout(100);
    await backgroundJobs.stop();

    expect(await backgroundJobs.jobModel.countDocuments()).toBe(1);

    const job = await backgroundJobs.jobModel.findOne();
    expect(job?.attemptsCount).toBe(1);
    expect(job?.nextRunAt?.getTime()).toBeGreaterThan(Date.now());
  });

  it("is possible to have job with non-default max attempts", async () => {
    await backgroundJobs.enqueue(NoRetryJob, { myNumber: 44, shouldFail: true });

    await backgroundJobs.start(["default"]);
    await setTimeout(100);
    await backgroundJobs.stop();

    expect(await backgroundJobs.jobModel.countDocuments()).toBe(1);

    const job = await backgroundJobs.jobModel.findOne();
    expect(job?.attemptsCount).toBe(1);
    expect(job?.nextRunAt).toBeUndefined();
    expect(job?.failedAt).toBeDefined();

    const jobFailedLog = testLogger.errorLogs.find(
      (log) => log.message === "Background Job Failed: NoRetryJob",
    );
    expect(jobFailedLog).toBeDefined();
    expect(jobFailedLog?.context["jobId"]).toBe(job?._id?.toString());
  });

  it("properly marks the job as failed when there is multiple jobs in the queue", async () => {
    const job1 = ensureExistence(
      await backgroundJobs.enqueue(NoRetryJob, { myNumber: 44, shouldFail: true }),
    );
    const job2 = ensureExistence(
      await backgroundJobs.enqueue(NoRetryJob, { myNumber: 44, shouldFail: true }),
    );

    await backgroundJobs.start(["default"]);
    await setTimeout(100);
    await backgroundJobs.stop();

    expect(await backgroundJobs.jobModel.countDocuments()).toBe(2);

    const job1_failed = await backgroundJobs.jobModel.findOne({ _id: job1._id });
    expect(job1_failed?.attemptsCount).toBe(1);
    expect(job1_failed?.nextRunAt).toBeUndefined();
    expect(job1_failed?.failedAt).toBeDefined();

    const job2_failed = await backgroundJobs.jobModel.findOne({ _id: job2._id });
    expect(job2_failed?.attemptsCount).toBe(1);
    expect(job2_failed?.nextRunAt).toBeUndefined();
    expect(job2_failed?.failedAt).toBeDefined();
  });

  it("when unique job is failed the uniqueKey is removed and it is possible to schedule another job with same key", async () => {
    const job = ensureExistence(
      await backgroundJobs.enqueue(
        NoRetryJob,
        { myNumber: 44, shouldFail: true },
        { unique: "my-key" },
      ),
    );

    expect(job.uniqueKey).toBe("my-key");

    await backgroundJobs.start(["default"]);
    await setTimeout(100);
    await backgroundJobs.stop();

    expect(await backgroundJobs.jobModel.countDocuments()).toBe(1);

    const job_failed = await backgroundJobs.jobModel.findOne({ _id: job._id });
    expect(job_failed?.attemptsCount).toBe(1);
    expect(job_failed?.nextRunAt).toBeUndefined();
    expect(job_failed?.failedAt).toBeDefined();
    expect(job_failed?.uniqueKey).toBeUndefined();

    const nextJob = await backgroundJobs.enqueue(
      NoRetryJob,
      { myNumber: 44, shouldFail: true },
      { unique: "my-key" },
    );
    expect(nextJob?.uniqueKey).toBe("my-key");
    expect(nextJob?._id).toBeDefined();

    expect(await backgroundJobs.jobModel.countDocuments()).toBe(2);
  });

  it("on worker stop it will wait for jobs to finish for specified amount of time", async () => {
    const job200 = await backgroundJobs.enqueue(LongJob, { sleepTime: 100, myNumber: 100 });
    const job500 = await backgroundJobs.enqueue(LongJob, { sleepTime: 500, myNumber: 500 });

    expect(job200).toBeDefined();
    expect(job500).toBeDefined();

    await backgroundJobs.start(["default"]);
    await setTimeout(100);
    await backgroundJobs.stop(250);

    expect(
      await backgroundJobs.jobModel.countDocuments({
        _id: (job200 as BackgroundJobType<unknown>)._id,
      }),
    ).toBe(0);
    expect(
      await backgroundJobs.jobModel.countDocuments({
        _id: (job500 as BackgroundJobType<unknown>)._id,
      }),
    ).toBe(1);

    expect(await JobRun.countDocuments()).toBe(1);
    const jobRun = await JobRun.findOne();
    expect(jobRun?.myNumber).toBe(100);
  });

  it("without change stream the job won't be consumed right after being enqueued", async () => {
    await backgroundJobs.start(["default"], { useChangeStream: false });
    await setTimeout(100);

    const myNumber = 5513;
    await backgroundJobs.enqueue(ExampleJob, { myNumber });

    await setTimeout(100);
    expect(await backgroundJobs.jobModel.countDocuments()).toBe(1);
  });

  it("with change stream the job will be consumed right after being enqueued even if it's during the wait for new job period", async () => {
    await backgroundJobs.start(["default"], { useChangeStream: true });
    await setTimeout(100);

    await backgroundJobs.enqueue(ExampleJob, { myNumber: 123 });

    await setTimeout(100);
    expect(await backgroundJobs.jobModel.countDocuments()).toBe(0);
    expect(await JobRun.countDocuments()).toBe(1);

    await setTimeout(100);
    await backgroundJobs.enqueue(ExampleJob, { myNumber: 555 });

    await setTimeout(100);
    expect(await backgroundJobs.jobModel.countDocuments()).toBe(0);
    expect(await JobRun.countDocuments()).toBe(2);
  });

  it("when run with exclude option, worker will not be consuming jobs from that queue", async () => {
    await backgroundJobs.enqueue(ExampleJob, { myNumber: 123 });
    await backgroundJobs.enqueue(EmptyExampleJob, {});
    await backgroundJobs.enqueue(ExampleJob, { myNumber: 555 });

    await backgroundJobs.start(["default"], { exclude: ["ExampleJob"] });

    await setTimeout(100);

    expect(await JobRun.countDocuments()).toBe(1);
    const jobRun = await JobRun.findOne();
    expect(jobRun?.myNumber).toBe(0);
    expect(await backgroundJobs.jobModel.countDocuments()).toBe(2);
  });

  it("we properly keep track of when the queue should become actionable again", async () => {
    // Job that should run in 1s
    await backgroundJobs.enqueue(
      ExampleJob,
      { myNumber: 1000 },
      { startAt: new Date(Date.now() + 1000) },
    );
    // Job that should run in 500ms
    await backgroundJobs.enqueue(
      ExampleJob,
      { myNumber: 500 },
      { startAt: new Date(Date.now() + 500) },
    );
    // Job that should run now
    await backgroundJobs.enqueue(ExampleJob, { myNumber: 1 }, { startAt: new Date() });

    await backgroundJobs.start(["default"]);
    await setTimeout(100);

    const runNumbers1 = await getMappedJobRuns();
    expect(runNumbers1).toHaveLength(1);
    expect(runNumbers1).toContain(1);

    await setTimeout(400);

    // Enqueuing job in another queue to trigger new worker loop
    await backgroundJobs.enqueue(EmptyExampleJob, {});

    await setTimeout(100);

    const runNumbers2 = await getMappedJobRuns();
    expect(runNumbers2).toHaveLength(3);
    expect(runNumbers2).toContain(1);
    expect(runNumbers2).toContain(500);
    expect(runNumbers2).toContain(0);

    await setTimeout(400);

    // Enqueuing job in another queue to trigger new worker loop
    await backgroundJobs.enqueue(EmptyExampleJob, {});

    await setTimeout(100);

    const runNumbers3 = await getMappedJobRuns();
    expect(runNumbers3).toHaveLength(5);
    expect(runNumbers3).toContain(1);
    expect(runNumbers3).toContain(500);
    expect(runNumbers3).toContain(1000);
    expect(runNumbers3).toContain(0);
  });
});

describe("Unique jobs", () => {
  let testContext: TestContext;
  let backgroundJobs: MongoJobs;
  let semaphore: Semaphore;

  beforeEach(async () => {
    testContext = await createTestContext();
    backgroundJobs = testContext.backgroundJobs;
    semaphore = new Semaphore();

    backgroundJobs.register(ExampleJob, "default");
    backgroundJobs.register(new SemaphoreJob(semaphore), "default");
  });

  afterEach(async () => {
    semaphore.cleanup();
    await testContext.tearDown();
  });

  it("is possible to put unique constraint on a job", async () => {
    const job1 = await backgroundJobs.enqueue(ExampleJob, { myNumber: 7 }, { unique: "example-7" });
    expect(job1).toBeDefined();
    expect(job1?.uniqueKey).toBe("example-7");
    expect(job1?.options).toStrictEqual({
      unique: { runningKey: "example-7", enqueuedKey: "example-7" },
    });

    const job2 = await backgroundJobs.enqueue(ExampleJob, { myNumber: 7 }, { unique: "example-7" });
    expect(job2).toBeUndefined();

    const otherJob = await backgroundJobs.enqueue(
      ExampleJob,
      { myNumber: 15 },
      { unique: "example-15" },
    );
    expect(otherJob).toBeDefined();
  });

  it("with a simple uniqueness the job holds uniqueness even if it starts running", async () => {
    semaphore.setNewPromise(1);
    semaphore.setNewPromise(2);

    const data = { resolvePromise: 1, waitPromise: 2 };
    const options = { unique: "semaphore" };

    const job = await backgroundJobs.enqueue(SemaphoreJob, data, options);
    const enqueueBeforeStart = await backgroundJobs.enqueue(SemaphoreJob, data, options);

    expect(job).toBeDefined();
    expect(enqueueBeforeStart).toBeUndefined();

    await backgroundJobs.start(["default"]);

    await semaphore.getPromise(1);

    const runningJob = await backgroundJobs.jobModel.findById(job?._id);
    expect(runningJob?.lockedAt).toBeDefined();

    const enqueueAfterStart = await backgroundJobs.enqueue(SemaphoreJob, data, options);
    expect(enqueueAfterStart).toBeUndefined();

    semaphore.resolvePromise(2);
    await setTimeout(100);

    const enqueueAfterFinished = await backgroundJobs.enqueue(SemaphoreJob, data, options);
    expect(enqueueAfterFinished).toBeDefined();

    await setTimeout(100);
  });

  it("is possible to set uniqueness so that once the job starts it is possible to enqueue another one", async () => {
    semaphore.setNewPromise(1);
    semaphore.setNewPromise(2);

    const data = { resolvePromise: 1, waitPromise: 2 };
    const options = { unique: { runningKey: "semaphore-running", enqueuedKey: "semaphore" } };

    const job = await backgroundJobs.enqueue(SemaphoreJob, data, options);
    const enqueueBeforeStart = await backgroundJobs.enqueue(SemaphoreJob, data, options);

    expect(job).toBeDefined();
    expect(enqueueBeforeStart).toBeUndefined();

    await backgroundJobs.start(["default"]);
    await semaphore.getPromise(1);

    const runningJob = await backgroundJobs.jobModel.findById(job?._id);
    expect(runningJob?.uniqueKey).toBe("semaphore-running");

    const enqueueAfterStart = await backgroundJobs.enqueue(SemaphoreJob, data, {
      ...options,
      startAt: new Date(Date.now() + 5000),
    });
    expect(enqueueAfterStart).toBeDefined();

    semaphore.resolvePromise(2);
    // Wait for job to complete before stopping
    await setTimeout(100);
    await backgroundJobs.stop();
  });

  it("in case of a clash in running keys the job will be rescheduled to later", async () => {
    semaphore.setNewPromise(1);
    semaphore.setNewPromise(2);

    const data = { resolvePromise: 1, waitPromise: 2 };

    const now = new Date();
    const job1 = await backgroundJobs.enqueue(SemaphoreJob, data, {
      unique: { enqueuedKey: undefined, runningKey: "running" },
      startAt: new Date(now.getTime() - 100),
    });
    const job2 = await backgroundJobs.enqueue(SemaphoreJob, data, {
      unique: { enqueuedKey: undefined, runningKey: "running" },
      startAt: now,
    });

    expect(job1).toBeDefined();
    expect(job2).toBeDefined();

    await backgroundJobs.start(["default"]);

    await semaphore.getPromise(1);
    await setTimeout(100);

    const jobs = await backgroundJobs.jobModel.find();
    const runningJob = jobs.find((job) => job.uniqueKey === "running");
    const waitingJob = jobs.find((job) => !job.uniqueKey);

    expect(runningJob).toBeDefined();
    expect(waitingJob).toBeDefined();

    const timeDiff = waitingJob?.nextRunAt
      ? waitingJob.nextRunAt.getTime() - now.getTime()
      : undefined;
    expect(timeDiff).toBeGreaterThanOrEqual(5000);
    expect(waitingJob?.lockedAt).toBeUndefined();
    expect(waitingJob?.uniqueKey).toBeUndefined();
    expect(waitingJob?.attemptsCount).toBe(0);

    semaphore.resolvePromise(2);
  });
});

describe("Helper APIs", () => {
  let testContext: TestContext;
  let backgroundJobs: MongoJobs;

  beforeEach(async () => {
    testContext = await createTestContext();
    backgroundJobs = testContext.backgroundJobs;

    backgroundJobs.register(ExampleJob, "default");
    backgroundJobs.register(NoRetryJob, "default");
  });

  afterEach(async () => {
    await testContext.tearDown();
  });

  it("is possible to fetch a job by id", async () => {
    const enqueuedJob = ensureExistence(
      await backgroundJobs.enqueue(ExampleJob, { myNumber: 123 }),
    );

    expect(await backgroundJobs.getJobById(enqueuedJob._id.toString())).toMatchObject({
      _id: enqueuedJob._id,
      data: { myNumber: 123 },
      attemptsCount: 0,
    });
  });

  it("is possible to cancel a job by id", async () => {
    const job1 = ensureExistence(await backgroundJobs.enqueue(ExampleJob, { myNumber: 123 }));
    const job2 = ensureExistence(await backgroundJobs.enqueue(ExampleJob, { myNumber: 555 }));
    const job3 = ensureExistence(await backgroundJobs.enqueue(ExampleJob, { myNumber: 333 }));

    await backgroundJobs.cancel([job1._id.toString(), job3._id.toString()]);

    expect(await backgroundJobs.getJobById(job1._id.toString())).toBeNull();
    expect(await backgroundJobs.getJobById(job2._id.toString())).toMatchObject({
      data: { myNumber: 555 },
    });
    expect(await backgroundJobs.getJobById(job3._id.toString())).toBeNull();
  });

  it("is possible to cancel a job by id within a transaction", async () => {
    const job1 = ensureExistence(await backgroundJobs.enqueue(ExampleJob, { myNumber: 123 }));
    const job2 = ensureExistence(await backgroundJobs.enqueue(ExampleJob, { myNumber: 555 }));

    const session = await createMongoSession();
    session.startTransaction();
    await backgroundJobs.cancel([job1._id.toString()], { session });
    await session.commitTransaction();

    expect(await backgroundJobs.getJobById(job1._id.toString())).toBeNull();
    expect(await backgroundJobs.getJobById(job2._id.toString())).toMatchObject({
      data: { myNumber: 555 },
    });
  });

  it("is possible to reset failed job to fresh state and it will be run again", async () => {
    const job1 = ensureExistence(
      await backgroundJobs.enqueue(NoRetryJob, { myNumber: 123, shouldFail: true }),
    );
    const job2 = ensureExistence(
      await backgroundJobs.enqueue(NoRetryJob, { myNumber: 555, shouldFail: true }),
    );

    void backgroundJobs.start(["default"]);
    await setTimeout(100);
    await backgroundJobs.stop();

    expect(await backgroundJobs.getJobById(job1._id.toString())).toMatchObject({
      data: { myNumber: 123 },
      attemptsCount: 1,
    });
    expect(await backgroundJobs.getJobById(job2._id.toString())).toMatchObject({
      data: { myNumber: 555 },
      attemptsCount: 1,
    });
    expect(await JobRun.countDocuments()).toBe(2);

    await backgroundJobs.retryJobById(job1._id.toString());

    expect(await backgroundJobs.getJobById(job1._id.toString())).toMatchObject({
      data: { myNumber: 123 },
      attemptsCount: 0,
    });
    expect(await backgroundJobs.getJobById(job2._id.toString())).toMatchObject({
      data: { myNumber: 555 },
      attemptsCount: 1,
    });

    void backgroundJobs.start(["default"]);
    await setTimeout(100);
    await backgroundJobs.stop();

    expect(await backgroundJobs.getJobById(job1._id.toString())).toMatchObject({
      data: { myNumber: 123 },
      attemptsCount: 1,
    });
    expect(await JobRun.countDocuments()).toBe(3);
  });

  it("when resetting a job with unique key we will honor uniqueness", async () => {
    const job1 = ensureExistence(
      await backgroundJobs.enqueue(
        NoRetryJob,
        { myNumber: 123, shouldFail: true },
        { unique: "my-job" },
      ),
    );

    void backgroundJobs.start(["default"]);
    await setTimeout(100);
    await backgroundJobs.stop();

    expect(await backgroundJobs.getJobById(job1._id.toString())).toMatchObject({
      data: { myNumber: 123 },
      attemptsCount: 1,
      uniqueKey: undefined,
    });

    const job2 = ensureExistence(
      await backgroundJobs.enqueue(
        NoRetryJob,
        { myNumber: 444, shouldFail: true },
        { unique: "my-job" },
      ),
    );

    await expect(backgroundJobs.retryJobById(job1._id.toString())).rejects.toThrow();

    expect(await backgroundJobs.getJobById(job1._id.toString())).toMatchObject({
      data: { myNumber: 123 },
      attemptsCount: 1,
      uniqueKey: undefined,
      failedAt: expect.anything(),
    });
    expect(await backgroundJobs.getJobById(job2._id.toString())).toMatchObject({
      data: { myNumber: 444 },
      attemptsCount: 0,
      uniqueKey: "my-job",
    });
  });
});

describe("Using custom connection", () => {
  it("is possible to use background jobs with custom connection", async () => {
    const otherDatabaseUrl = "mongodb://localhost:27017/background-jobs-mongo-test-other-db";
    await dropDatabase(otherDatabaseUrl);

    const connection = await createMongoConnection(otherDatabaseUrl);
    const backgroundJobs = new MongoJobs({ dbConnection: connection });

    backgroundJobs.register(ExampleJob, "default");

    await backgroundJobs.enqueue(ExampleJob, { myNumber: 100 });
    expect(await backgroundJobs.jobModel.countDocuments()).toBe(1);
    expect(await connection.collection("backgroundjobs").countDocuments()).toBe(1);

    await connection.close();
  });
});
