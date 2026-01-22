import {
  isTriggerIdempotencyKeyParams,
  type TriggerIdempotencyKeyParams,
} from "./triggerIdempotencyKey";

describe("isTriggerIdempotencyKeyParams", () => {
  it("returns false for string", () => {
    const actual = isTriggerIdempotencyKeyParams("some string");

    expect(actual).toBe(false);
  });

  it("returns false for object missing chunk", () => {
    const input = {
      workflowKey: "test-workflow",
      recipients: ["user1"],
    };

    const actual = isTriggerIdempotencyKeyParams(input);

    expect(actual).toBe(false);
  });

  it("returns false for object missing workflowKey", () => {
    const input = {
      chunk: 1,
      recipients: ["user1"],
    };

    const actual = isTriggerIdempotencyKeyParams(input);

    expect(actual).toBe(false);
  });

  it("returns false for object missing recipients", () => {
    const input = {
      chunk: 1,
      workflowKey: "test-workflow",
    };

    const actual = isTriggerIdempotencyKeyParams(input);

    expect(actual).toBe(false);
  });

  it("returns false when recipients is not an array", () => {
    const input = {
      chunk: 1,
      workflowKey: "test-workflow",
      recipients: "not-an-array",
    };

    const actual = isTriggerIdempotencyKeyParams(input);

    expect(actual).toBe(false);
  });

  it("returns false when recipients array contains non-string values", () => {
    const input = {
      chunk: 1,
      workflowKey: "test-workflow",
      recipients: ["user1", 123, "user3"],
    };

    const actual = isTriggerIdempotencyKeyParams(input);

    expect(actual).toBe(false);
  });

  it("returns true for valid TriggerIdempotencyKeyParams with required fields only", () => {
    const input: TriggerIdempotencyKeyParams = {
      chunk: 1,
      workflowKey: "test-workflow",
      recipients: ["user1", "user2"],
    };

    const actual = isTriggerIdempotencyKeyParams(input);

    expect(actual).toBe(true);
  });

  it("returns true for valid TriggerIdempotencyKeyParams with resource", () => {
    const input: TriggerIdempotencyKeyParams = {
      chunk: 1,
      workflowKey: "test-workflow",
      recipients: ["user1", "user2"],
      resource: { id: "resource-123", type: "account" },
    };

    const actual = isTriggerIdempotencyKeyParams(input);

    expect(actual).toBe(true);
  });

  it("returns true for valid TriggerIdempotencyKeyParams with eventOccurredAt", () => {
    const input: TriggerIdempotencyKeyParams = {
      chunk: 1,
      workflowKey: "test-workflow",
      recipients: ["user1", "user2"],
      eventOccurredAt: new Date().toISOString(),
    };

    const actual = isTriggerIdempotencyKeyParams(input);

    expect(actual).toBe(true);
  });

  it("returns true for valid TriggerIdempotencyKeyParams with empty recipients array", () => {
    const input: TriggerIdempotencyKeyParams = {
      chunk: 1,
      workflowKey: "test-workflow",
      recipients: [],
    };

    const actual = isTriggerIdempotencyKeyParams(input);

    expect(actual).toBe(true);
  });
});
