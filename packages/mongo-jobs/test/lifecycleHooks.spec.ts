import type { BackgroundJobs } from "../src";
import { ExampleJob } from "./support/exampleJob";
import { createTestContext, type TestContext } from "./support/testContext";
import { waitForJobRunCount } from "./support/waitForJobRunCount";

describe("Lifecycle hooks", () => {
  let testContext: TestContext;
  let backgroundJobs: BackgroundJobs;

  afterEach(async () => {
    await testContext.tearDown();
  });

  describe("onBeforeEnqueue", () => {
    it("persists context set by callback into job data", async () => {
      testContext = await createTestContext({
        onBeforeEnqueue: ({ setContext }) => {
          setContext("_dsmContext", { pathway: "test-pathway" });
        },
      });
      backgroundJobs = testContext.backgroundJobs;
      backgroundJobs.register(ExampleJob, "default");

      const job = await backgroundJobs.enqueue(ExampleJob, { myNumber: 42 });

      const storedJob = await backgroundJobs.jobModel.findById(job?._id);
      const data = storedJob?.data as { _context?: Record<string, unknown> };
      expect(data._context?.["_dsmContext"]).toEqual({ pathway: "test-pathway" });
    });

    it("does not affect job data when no callback is provided", async () => {
      testContext = await createTestContext();
      backgroundJobs = testContext.backgroundJobs;
      backgroundJobs.register(ExampleJob, "default");

      const job = await backgroundJobs.enqueue(ExampleJob, { myNumber: 42 });

      const storedJob = await backgroundJobs.jobModel.findById(job?._id);
      const data = storedJob?.data as { _context?: Record<string, unknown>; myNumber: number };
      expect(data._context).toStrictEqual({});
      expect(data.myNumber).toBe(42);
    });
  });

  describe("onBeforePerform", () => {
    it("fires with handler name and job data before the handler runs", async () => {
      const received: Array<{ handlerName: string; data: { _context?: Record<string, unknown> } }> =
        [];

      testContext = await createTestContext({
        onBeforeEnqueue: ({ setContext }) => {
          setContext("_dsmContext", { pathway: "test-pathway" });
        },
        onBeforePerform: ({ handlerName, data }) => {
          received.push({ handlerName, data: { ...data } });
        },
      });
      backgroundJobs = testContext.backgroundJobs;
      backgroundJobs.register(ExampleJob, "default");

      await backgroundJobs.enqueue(ExampleJob, { myNumber: 42 });

      await backgroundJobs.start(["default"]);
      await waitForJobRunCount({ expectedCount: 1 });
      await backgroundJobs.stop();

      expect(received).toHaveLength(1);
      expect(received[0]?.handlerName).toBe("ExampleJob");
      expect(received[0]?.data._context?.["_dsmContext"]).toEqual({ pathway: "test-pathway" });
    });
  });
});
