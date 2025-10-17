import { Types } from "mongoose";

import { type MongoJobs } from "../src";
import { drainHandlers, drainQueues } from "../src/lib/testing";
import { EmptyExampleJob } from "./support/emptyExampleJob";
import { EnqueueAnotherJob } from "./support/enqueueAnotherJob";
import { ExampleJob } from "./support/exampleJob";
import { FailingJob } from "./support/failingJob";
import { JobRun } from "./support/jobRun";
import { LongJob } from "./support/longJob";
import { NoRetryJob } from "./support/noRetryJob";
import { OtherQueueJob } from "./support/otherQueueJob";
import { createTestContext, type TestContext } from "./support/testContext";

const HOURS = 1000 * 60 * 60;

describe("Testing helpers", () => {
  let testContext: TestContext;
  let backgroundJobs: MongoJobs;

  beforeEach(async () => {
    testContext = await createTestContext();
    backgroundJobs = testContext.backgroundJobs;

    backgroundJobs.register(ExampleJob, "default");
    backgroundJobs.register(EmptyExampleJob, "default");
    backgroundJobs.register(EnqueueAnotherJob, "default");
    backgroundJobs.register(FailingJob, "default");
    backgroundJobs.register(LongJob, "default");
    backgroundJobs.register(NoRetryJob, "default");
    backgroundJobs.register(OtherQueueJob, "other-queue");
  });

  afterEach(async () => {
    await testContext.tearDown();
  });

  describe("drainQueues", () => {
    it("consumes jobs from given group", async () => {
      await backgroundJobs.enqueue(ExampleJob, { myNumber: 123 });
      await backgroundJobs.enqueue(OtherQueueJob, { myNumber: 999 });
      await backgroundJobs.enqueue(ExampleJob, { myNumber: 555 });

      await drainQueues(backgroundJobs, ["default"]);

      const jobRuns = await JobRun.find({});
      expect(jobRuns).toHaveLength(2);

      const myNumbers = jobRuns.map((jobRun) => jobRun.myNumber);
      expect(myNumbers).toContain(123);
      expect(myNumbers).toContain(555);

      const remainingJobs = await backgroundJobs.jobModel.find({});
      expect(remainingJobs).toHaveLength(1);
    });
  });

  describe("drainHandlers", () => {
    it("consumes jobs for given handler", async () => {
      await backgroundJobs.enqueue(ExampleJob, { myNumber: 123 });
      await backgroundJobs.enqueue(EmptyExampleJob, {});
      await backgroundJobs.enqueue(ExampleJob, { myNumber: 555 });

      await drainHandlers(backgroundJobs, [ExampleJob]);

      const jobRuns = await JobRun.find({});
      expect(jobRuns).toHaveLength(2);

      const myNumbers = jobRuns.map((jobRun) => jobRun.myNumber);
      expect(myNumbers).toContain(123);
      expect(myNumbers).toContain(555);

      const remainingJobs = await backgroundJobs.jobModel.find({});
      expect(remainingJobs).toHaveLength(1);
    });

    it("is possible to consume jobs by handler name", async () => {
      await backgroundJobs.enqueue(ExampleJob, { myNumber: 123 });
      await backgroundJobs.enqueue(EmptyExampleJob, {});
      await backgroundJobs.enqueue(ExampleJob, { myNumber: 555 });

      await drainHandlers(backgroundJobs, ["ExampleJob"]);

      const jobRuns = await JobRun.find({});
      expect(jobRuns).toHaveLength(2);

      const myNumbers = jobRuns.map((jobRun) => jobRun.myNumber);
      expect(myNumbers).toContain(123);
      expect(myNumbers).toContain(555);

      const remainingJobs = await backgroundJobs.jobModel.find({});
      expect(remainingJobs).toHaveLength(1);
    });

    it("should allow enqueueing new job with same enqueuedKey after first job starts running (advanced unique options)", async () => {
      jest.spyOn(testContext.backgroundJobs.jobModel, "updateOne");
      const uniqueOptions = {
        enqueuedKey: "facility-cache-update",
        runningKey: "facility-cache-update-running",
      };

      // Enqueue a job that will enqueue itself while running
      await backgroundJobs.enqueue(
        ExampleJob,
        {
          myNumber: 100,
        },
        { unique: uniqueOptions },
      );

      const jobs = await backgroundJobs.jobModel.find({});

      expect(jobs[0]?.uniqueKey).toBe("facility-cache-update");

      await drainHandlers(backgroundJobs, [ExampleJob]);

      expect(backgroundJobs.jobModel.updateOne).toHaveBeenCalledWith(
        { _id: expect.any(Types.ObjectId) },
        { $set: { uniqueKey: "facility-cache-update-running" } },
      );
    });

    it("is possible to set time in the future till when we want to consume jobs", async () => {
      await backgroundJobs.enqueue(ExampleJob, { myNumber: 123 });
      await backgroundJobs.enqueue(ExampleJob, { myNumber: 456 });
      await backgroundJobs.enqueue(
        ExampleJob,
        { myNumber: 555 },
        { startAt: new Date(Date.now() + 5 * HOURS) },
      ); // in 5 hours
      await backgroundJobs.enqueue(
        ExampleJob,
        { myNumber: 1010 },
        { startAt: new Date(Date.now() + 10 * HOURS) },
      ); // in 10 hours

      await drainQueues(backgroundJobs, ["default"]);
      let jobRuns = await JobRun.find({});
      expect(jobRuns).toHaveLength(2);

      let myNumbers = jobRuns.map((jobRun) => jobRun.myNumber);
      expect(myNumbers).toContain(123);
      expect(myNumbers).toContain(456);

      await drainQueues(backgroundJobs, ["default"], {
        jobsScheduledUntil: new Date(Date.now() + 6 * HOURS),
      });

      jobRuns = await JobRun.find({});
      expect(jobRuns).toHaveLength(3);

      myNumbers = jobRuns.map((jobRun) => jobRun.myNumber);
      expect(myNumbers).toContain(123);
      expect(myNumbers).toContain(456);
      expect(myNumbers).toContain(555);

      await drainQueues(backgroundJobs, ["default"], {
        jobsScheduledUntil: new Date(Date.now() + 11 * HOURS),
      });

      jobRuns = await JobRun.find({});
      expect(jobRuns).toHaveLength(4);

      myNumbers = jobRuns.map((jobRun) => jobRun.myNumber);
      expect(myNumbers).toContain(123);
      expect(myNumbers).toContain(456);
      expect(myNumbers).toContain(555);
      expect(myNumbers).toContain(1010);
    });

    it("will consume jobs scheduled from other jobs", async () => {
      await backgroundJobs.enqueue(EnqueueAnotherJob, { myNumber: 123 });

      await drainQueues(backgroundJobs, ["default"]);
      const jobRuns = await JobRun.find({});
      expect(jobRuns).toHaveLength(1);

      const myNumbers = jobRuns.map((jobRun) => jobRun.myNumber);
      expect(myNumbers).toContain(123);
    });

    it("will not consume jobs scheduled from other jobs if recursive is false", async () => {
      await backgroundJobs.enqueue(EnqueueAnotherJob, { myNumber: 123 });

      await drainQueues(backgroundJobs, ["default"], { recursive: false });
      const jobRuns = await JobRun.find({});
      expect(jobRuns).toHaveLength(0);
    });
  });
});
