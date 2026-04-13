import { getTestWorkerUri } from "./getTestWorkerUri";

describe(getTestWorkerUri, () => {
  let originalWorkerId: string | undefined;

  beforeEach(() => {
    originalWorkerId = process.env["VITEST_POOL_ID"];
  });

  afterEach(() => {
    if (originalWorkerId === undefined) {
      delete process.env["VITEST_POOL_ID"];
      return;
    }

    process.env["VITEST_POOL_ID"] = originalWorkerId;
  });

  it("replaces the test worker placeholder", () => {
    process.env["VITEST_POOL_ID"] = "7";

    const actual = getTestWorkerUri("mongodb://localhost/tests-{{test_worker_id}}");

    expect(actual).toBe("mongodb://localhost/tests-7");
  });

  it("throws when template is blank after trimming", () => {
    process.env["VITEST_POOL_ID"] = "7";

    expect(() => {
      getTestWorkerUri("   ");
    }).toThrow("Argument 'template' representing a string for the URI can't be blank");
  });

  it("throws when template does not include the worker placeholder", () => {
    process.env["VITEST_POOL_ID"] = "7";

    expect(() => {
      getTestWorkerUri("mongodb://localhost/tests");
    }).toThrow("Argument 'template' must include the '{{test_worker_id}}' placeholder");
  });

  it("throws when the worker id is missing", () => {
    delete process.env["VITEST_POOL_ID"];

    expect(() => {
      getTestWorkerUri("mongodb://localhost/tests-{{test_worker_id}}");
    }).toThrow("Environment variable 'VITEST_POOL_ID' was not set in the current context");
  });
});
