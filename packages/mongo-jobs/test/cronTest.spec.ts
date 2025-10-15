import type { BackgroundJobsService } from "../src";
import { Semaphore } from "./support/semaphore";
import { SemaphoreJob } from "./support/semaphoreJob";
import { createTestContext, type TestContext } from "./support/testContext";

const allFakeableTimers: FakeableAPI[] = [
  "Date",
  "hrtime",
  "nextTick",
  "performance",
  "queueMicrotask",
  "requestAnimationFrame",
  "cancelAnimationFrame",
  "requestIdleCallback",
  "cancelIdleCallback",
  "setImmediate",
  "clearImmediate",
  "setInterval",
  "clearInterval",
  "setTimeout",
  "clearTimeout",
];

function jestFakeOnlyTimers(toFake: FakeableAPI[]) {
  const notToFake = new Set(allFakeableTimers);

  toFake.forEach((timer) => notToFake.delete(timer));

  jest.useFakeTimers({
    doNotFake: [...notToFake],
    now: new Date("2023-07-04T14:59:00.000Z").getTime(),
  });
}

describe("Cron jobs", () => {
  let testContext: TestContext;
  let backgroundJobs: BackgroundJobsService;
  let semaphore: Semaphore;

  beforeEach(async () => {
    testContext = await createTestContext();
    backgroundJobs = testContext.backgroundJobs;
    semaphore = new Semaphore();

    jestFakeOnlyTimers(["Date"]);
  });

  afterEach(async () => {
    semaphore.cleanup();
    await backgroundJobs.stop();
    jest.useRealTimers();
    await testContext.tearDown();
  });

  it("when registering a cron it schedules a job to be run on the next cron tick and when this job starts it schedules one for next cron tick", async () => {
    semaphore.setNewPromise(1);
    semaphore.setNewPromise(2);

    // Registering cron, making sure that the job is scheduled
    await backgroundJobs.registerCron(new SemaphoreJob(semaphore), {
      group: "default",
      cronExpression: "10 * * * *",
      scheduleName: "cron-semaphores",
      data: { resolvePromise: 1, waitPromise: 2 },
    });
    expect(await backgroundJobs.jobModel.countDocuments()).toBe(1);

    const job1 = await backgroundJobs.jobModel.findOne({ scheduleName: "cron-semaphores" });
    expect(job1?.nextRunAt).toStrictEqual(new Date("2023-07-04T15:10:00.000Z"));

    /* Setting the system time to when the job should run, checking that the
     * job runs and new one is scheduled
     */
    jest.setSystemTime(new Date("2023-07-04T15:10:00.000Z"));

    void backgroundJobs.start(["default"]);
    await semaphore.getPromise(1);

    expect(await backgroundJobs.jobModel.countDocuments()).toBe(2);
    const job2 = await backgroundJobs.jobModel.findOne(
      { scheduleName: "cron-semaphores" },
      undefined,
      { sort: { nextRunAt: -1 } },
    );
    expect(job2?.nextRunAt).toStrictEqual(new Date("2023-07-04T16:10:00.000Z"));

    semaphore.resolvePromise(2);
  });

  it("when schedule is updated then it removes the upcoming job and creates a new one", async () => {
    await backgroundJobs.registerCron(new SemaphoreJob(semaphore), {
      group: "default",
      cronExpression: "10 * * * *",
      scheduleName: "cron-semaphores",
      data: { resolvePromise: 1, waitPromise: 2 },
    });
    expect(await backgroundJobs.jobModel.countDocuments()).toBe(1);

    const job1 = await backgroundJobs.jobModel.findOne({ scheduleName: "cron-semaphores" });
    expect(job1?.nextRunAt).toStrictEqual(new Date("2023-07-04T15:10:00.000Z"));

    await backgroundJobs.registerCron(new SemaphoreJob(semaphore), {
      group: "default",
      cronExpression: "20 * * * *",
      scheduleName: "cron-semaphores",
      data: { resolvePromise: 1, waitPromise: 2 },
    });

    expect(await backgroundJobs.jobModel.countDocuments()).toBe(1);

    const job2 = await backgroundJobs.jobModel.findOne({ scheduleName: "cron-semaphores" });
    expect(job2?.nextRunAt).toStrictEqual(new Date("2023-07-04T15:20:00.000Z"));
    expect(job2?._id).not.toBe(job1?._id);
  });

  it("when the job times out and is picked up again it won't schedule additional job for next cron iteration (thanks to unique key)", async () => {
    semaphore.setNewPromise(1);
    semaphore.setNewPromise(2);

    // Registering cron, making sure that the job is scheduled
    await backgroundJobs.registerCron(new SemaphoreJob(semaphore), {
      group: "default",
      cronExpression: "10 * * * *",
      scheduleName: "cron-semaphores",
      data: { resolvePromise: 1, waitPromise: 2 },
    });
    expect(await backgroundJobs.jobModel.countDocuments()).toBe(1);

    const job1 = await backgroundJobs.jobModel.findOne({
      scheduleName: "cron-semaphores",
    });
    expect(job1?.nextRunAt).toStrictEqual(new Date("2023-07-04T15:10:00.000Z"));

    /* Setting the system time to when the job should run, checking that the
     * job runs and new one is scheduled
     */
    jest.setSystemTime(new Date("2023-07-04T15:10:00.000Z"));

    void backgroundJobs.start(["default"]);
    await semaphore.getPromise(1);

    await backgroundJobs.stop(500);

    // Move time by 15 minutes
    jest.setSystemTime(new Date("2023-07-04T15:25:00.000Z"));

    // Set new promise in semaphore to wait for when new execution of job1 starts
    semaphore.setNewPromise(1);

    // Unlock job1 to make sure that it will run when we start the worker
    await backgroundJobs.jobModel.updateOne({ _id: job1?._id }, { $unset: { lockedAt: "" } });

    void backgroundJobs.start(["default"]);
    await semaphore.getPromise(1);

    expect(await backgroundJobs.jobModel.countDocuments()).toBe(2);

    const job1Again = await backgroundJobs.jobModel.findOne(
      { scheduleName: "cron-semaphores" },
      undefined,
      { sort: { nextRunAt: 1 } },
    );
    expect(job1Again?.attemptsCount).toBe(0);
    expect(job1Again?.lockedAt).toStrictEqual(new Date("2023-07-04T15:25:00.000Z"));

    const job2 = await backgroundJobs.jobModel.findOne(
      { scheduleName: "cron-semaphores" },
      undefined,
      { sort: { nextRunAt: -1 } },
    );
    expect(job2?.nextRunAt).toStrictEqual(new Date("2023-07-04T16:10:00.000Z"));

    semaphore.resolvePromise(2);
  });

  it("is possible to define in which timezone should the cron run", async () => {
    // Run cron at 2:10 am in America/Los_Angeles time zone (which will be 9:10am in UTC)
    await backgroundJobs.registerCron(new SemaphoreJob(semaphore), {
      group: "default",
      cronExpression: "10 2 * * *",
      timeZone: "America/Los_Angeles",
      scheduleName: "cron-semaphores",
      data: { resolvePromise: 1, waitPromise: 2 },
    });

    const job1 = await backgroundJobs.jobModel.findOne({ scheduleName: "cron-semaphores" });
    expect(job1?.nextRunAt).toStrictEqual(new Date("2023-07-05T09:10:00.000Z"));
  });

  it("is possible to remove the cron", async () => {
    await backgroundJobs.registerCron(new SemaphoreJob(semaphore), {
      group: "default",
      cronExpression: "10 * * * *",
      scheduleName: "cron-semaphores",
      data: { resolvePromise: 1, waitPromise: 2 },
    });
    expect(await backgroundJobs.jobModel.countDocuments()).toBe(1);
    expect(await backgroundJobs.scheduleModel.countDocuments()).toBe(1);

    await backgroundJobs.removeCron("cron-semaphores");

    expect(await backgroundJobs.jobModel.countDocuments()).toBe(0);
    expect(await backgroundJobs.scheduleModel.countDocuments()).toBe(0);
  });

  it("is possible to have 2 schedules for same handler and different data", async () => {
    await backgroundJobs.registerCron(new SemaphoreJob(semaphore), {
      group: "group1",
      cronExpression: "10 * * * *",
      scheduleName: "cron-semaphores-1",
      data: { resolvePromise: 1, waitPromise: 2 },
    });

    await backgroundJobs.registerCron(new SemaphoreJob(semaphore), {
      group: "group2",
      cronExpression: "20 * * * *",
      scheduleName: "cron-semaphores-2",
      data: { resolvePromise: 4, waitPromise: 5 },
    });

    expect(await backgroundJobs.jobModel.countDocuments()).toBe(2);
    expect(await backgroundJobs.scheduleModel.countDocuments()).toBe(2);

    const job1 = await backgroundJobs.jobModel.findOne({}, undefined, { sort: { nextRunAt: 1 } });
    const job2 = await backgroundJobs.jobModel.findOne({}, undefined, { sort: { nextRunAt: -1 } });

    expect(job1?.data).toStrictEqual({ resolvePromise: 1, waitPromise: 2 });
    expect(job1?.nextRunAt).toStrictEqual(new Date("2023-07-04T15:10:00.000Z"));
    expect(job1?.scheduleName).toBe("cron-semaphores-1");
    expect(job1?.queue).toBe("SemaphoreJob");

    expect(job2?.data).toStrictEqual({ resolvePromise: 4, waitPromise: 5 });
    expect(job2?.nextRunAt).toStrictEqual(new Date("2023-07-04T15:20:00.000Z"));
    expect(job2?.scheduleName).toBe("cron-semaphores-2");
    expect(job2?.queue).toBe("SemaphoreJob");
  });
});
