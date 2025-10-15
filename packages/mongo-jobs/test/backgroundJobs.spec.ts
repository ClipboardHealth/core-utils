/* eslint-disable  @typescript-eslint/dot-notation */
import { BackgroundJobsService } from "../src/lib/backgroundJobs";
import { ExampleJob } from "./support/exampleJob";

describe("Registering background jobs", () => {
  let backgroundJobs: BackgroundJobsService;

  beforeEach(() => {
    backgroundJobs = new BackgroundJobsService();
  });

  it("is not possible to schedule a job for unregistered handler", async () => {
    await expect(async () => {
      await backgroundJobs.enqueue(ExampleJob, { myNumber: 1 });
    }).rejects.toThrow(/No handler registered/);
  });

  it("when worker is started with options, options are passed to the worker", async () => {
    await backgroundJobs.start(["default"], {
      lockTimeoutMS: 12_345,
      maxConcurrency: 7,
      newJobCheckWaitMS: 111_111,
      unlockJobsIntervalMS: 55_555,
    });

    expect(backgroundJobs["worker"]?.["lockTimeoutMS"]).toBe(12_345);
    expect(backgroundJobs["worker"]?.["maxConcurrency"]).toBe(7);
    expect(backgroundJobs["worker"]?.["newJobCheckWaitMS"]).toBe(111_111);
    expect(backgroundJobs["worker"]?.["unlockJobsIntervalMS"]).toBe(55_555);
    await backgroundJobs.stop(0);
  });

  it("when worker is started without particular options then default values are used", async () => {
    await backgroundJobs.start(["default"], {});

    expect(backgroundJobs["worker"]?.["lockTimeoutMS"]).toBe(600_000);
    expect(backgroundJobs["worker"]?.["maxConcurrency"]).toBe(10);
    expect(backgroundJobs["worker"]?.["newJobCheckWaitMS"]).toBe(10_000);
    expect(backgroundJobs["worker"]?.["unlockJobsIntervalMS"]).toBe(60_000);
    await backgroundJobs.stop(0);
  });
});
/* eslint-enable  @typescript-eslint/dot-notation */
