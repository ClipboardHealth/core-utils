/* eslint-disable  @typescript-eslint/dot-notation */
import { BackgroundJobs } from "../src/lib/backgroundJobs";
import type { Registry } from "../src/lib/internal/registry";
import { ExampleJob } from "./support/exampleJob";
import { JobWithDependencies } from "./support/jobWithDependencies";

describe("Registering background jobs", () => {
  let backgroundJobs: BackgroundJobs;
  let registry: Registry;

  beforeEach(() => {
    backgroundJobs = new BackgroundJobs();
    registry = backgroundJobs["registry"];
  });

  it("is possible to register a handler as an instance and then get the registered handler by name", () => {
    backgroundJobs.register(new JobWithDependencies("myDependency"), "default");

    const { handler, queue, group } = registry.getRegisteredHandler("JobWithDependencies");

    expect(group).toBe("default");
    expect(queue).toBe("JobWithDependencies");
    expect(handler.name).toBe("JobWithDependencies");
    expect((handler as JobWithDependencies).dependencyName).toBe("myDependency");
  });

  it("is possible to register a handler as an instance and then get the registered handler by class", () => {
    backgroundJobs.register(new JobWithDependencies("myDependency"), "default");

    const { handler, queue, group } = registry.getRegisteredHandler(JobWithDependencies);

    expect(group).toBe("default");
    expect(queue).toBe("JobWithDependencies");
    expect(handler.name).toBe("JobWithDependencies");
    expect((handler as JobWithDependencies).dependencyName).toBe("myDependency");
  });

  it("is possible to register a handler as an instance and then get the registered handler by another instance (and get the registered instance)", () => {
    backgroundJobs.register(new JobWithDependencies("myDependency"), "default");

    const { handler, queue, group } = registry.getRegisteredHandler(
      new JobWithDependencies("otherDependency"),
    );

    expect(group).toBe("default");
    expect(queue).toBe("JobWithDependencies");
    expect(handler.name).toBe("JobWithDependencies");
    expect((handler as JobWithDependencies).dependencyName).toBe("myDependency");
  });

  it("is possible to register a handler with empty constructor as a class and get it by name", () => {
    backgroundJobs.register(ExampleJob, "default");

    const { handler, queue, group } = registry.getRegisteredHandler("ExampleJob");

    expect(group).toBe("default");
    expect(queue).toBe("ExampleJob");
    expect(handler.name).toBe("ExampleJob");
  });

  it("is possible to register a handler with empty constructor as a class and get it by class", () => {
    backgroundJobs.register(ExampleJob, "default");

    const { handler, queue, group } = registry.getRegisteredHandler(ExampleJob);

    expect(group).toBe("default");
    expect(queue).toBe("ExampleJob");
    expect(handler.name).toBe("ExampleJob");
  });

  it("is possible to register a handler with empty constructor as a class and get it by instance", () => {
    backgroundJobs.register(ExampleJob, "default");

    const { handler, queue, group } = registry.getRegisteredHandler(new ExampleJob());

    expect(group).toBe("default");
    expect(queue).toBe("ExampleJob");
    expect(handler.name).toBe("ExampleJob");
  });

  it("is not possible to register a job with the same name twice", () => {
    backgroundJobs.register(ExampleJob, "default");
    expect(() => {
      backgroundJobs.register(ExampleJob, "default");
    }).toThrow("ExampleJob already registered");
  });

  it("is possible to register a job with same name if allowHandlerOverride is set to true", () => {
    const overridableBackgroundJobs = new BackgroundJobs({ allowHandlerOverride: true });
    const overridableRegistry = overridableBackgroundJobs["registry"];

    overridableBackgroundJobs.register(ExampleJob, "default");
    const group1 = overridableRegistry.getRegisteredHandler("ExampleJob").group;
    expect(group1).toBe("default");

    overridableBackgroundJobs.register(ExampleJob, "other-queue");
    const group2 = overridableRegistry.getRegisteredHandler("ExampleJob").group;
    expect(group2).toBe("other-queue");
  });
});
/* eslint-enable  @typescript-eslint/dot-notation */
