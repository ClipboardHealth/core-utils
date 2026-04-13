/* eslint-disable  @typescript-eslint/dot-notation */
import { BackgroundJobs } from "../src/lib/backgroundJobs";
import { ExampleJob } from "./support/exampleJob";

describe("Registering background jobs", () => {
  let backgroundJobs: BackgroundJobs;

  beforeEach(() => {
    backgroundJobs = new BackgroundJobs();
  });

  it("is not possible to schedule a job for unregistered handler", async () => {
    await expect(async () => {
      await backgroundJobs.enqueue(ExampleJob, { myNumber: 1 });
    }).rejects.toThrow(/No handler registered/);
  });

  it("when worker is started with options, options are passed to the worker", () => {
    const worker = backgroundJobs.buildWorker(["default"], {
      lockTimeoutMS: 12_345,
      maxConcurrency: 7,
      newJobCheckWaitMS: 111_111,
      unlockJobsIntervalMS: 55_555,
    });

    expect(worker["lockTimeoutMS"]).toBe(12_345);
    expect(worker["maxConcurrency"]).toBe(7);
    expect(worker["newJobCheckWaitMS"]).toBe(111_111);
    expect(worker["unlockJobsIntervalMS"]).toBe(55_555);
  });

  it("when worker is started without particular options then default values are used", () => {
    const worker = backgroundJobs.buildWorker(["default"], {});

    expect(worker["lockTimeoutMS"]).toBe(600_000);
    expect(worker["maxConcurrency"]).toBe(10);
    expect(worker["newJobCheckWaitMS"]).toBe(10_000);
    expect(worker["unlockJobsIntervalMS"]).toBe(60_000);
  });
});
/* eslint-enable  @typescript-eslint/dot-notation */
