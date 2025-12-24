import { toTriggerChunkedRequest } from "./toTriggerChunkedRequest";
import type { SerializableTriggerChunkedRequest } from "./types";

describe("toTriggerChunkedRequest", () => {
  const mockParams = { attempt: 1, idempotencyKey: "job-123" };

  it("converts string recipients without modification", () => {
    const input: SerializableTriggerChunkedRequest = {
      workflowKey: "test-workflow",
      body: {
        recipients: ["user-1", "user-2"],
      },
      expiresAt: "2024-01-01T00:00:00.000Z",
    };

    const actual = toTriggerChunkedRequest(input, mockParams);

    expect(actual).toEqual({
      workflowKey: "test-workflow",
      body: {
        recipients: ["user-1", "user-2"],
      },
      expiresAt: new Date("2024-01-01T00:00:00.000Z"),
      attempt: 1,
      idempotencyKey: "job-123",
    });
  });

  it("converts recipient createdAt from string to Date", () => {
    const input: SerializableTriggerChunkedRequest = {
      workflowKey: "test-workflow",
      body: {
        recipients: [
          {
            userId: "user-1",
            createdAt: "2023-06-15T10:30:00.000Z",
            email: "user@example.com",
          },
        ],
      },
      expiresAt: "2024-01-01T00:00:00.000Z",
    };

    const actual = toTriggerChunkedRequest(input, mockParams);

    expect(actual.body.recipients).toEqual([
      {
        userId: "user-1",
        createdAt: new Date("2023-06-15T10:30:00.000Z"),
        email: "user@example.com",
      },
    ]);
  });

  it("handles recipient without createdAt", () => {
    const input: SerializableTriggerChunkedRequest = {
      workflowKey: "test-workflow",
      body: {
        recipients: [{ userId: "user-1", email: "user@example.com" }],
      },
      expiresAt: "2024-01-01T00:00:00.000Z",
    };

    const actual = toTriggerChunkedRequest(input, mockParams);

    expect(actual.body.recipients).toEqual([
      { userId: "user-1", createdAt: undefined, email: "user@example.com" },
    ]);
  });

  it("converts actor createdAt from string to Date", () => {
    const input: SerializableTriggerChunkedRequest = {
      workflowKey: "test-workflow",
      body: {
        recipients: ["user-1"],
        actor: {
          userId: "admin-1",
          createdAt: "2023-01-01T00:00:00.000Z",
        },
      },
      expiresAt: "2024-01-01T00:00:00.000Z",
    };

    const actual = toTriggerChunkedRequest(input, mockParams);

    expect(actual.body.actor).toEqual({
      userId: "admin-1",
      createdAt: new Date("2023-01-01T00:00:00.000Z"),
    });
  });

  it("handles string actor", () => {
    const input: SerializableTriggerChunkedRequest = {
      workflowKey: "test-workflow",
      body: {
        recipients: ["user-1"],
        actor: "admin-1",
      },
      expiresAt: "2024-01-01T00:00:00.000Z",
    };

    const actual = toTriggerChunkedRequest(input, mockParams);

    expect(actual.body.actor).toBe("admin-1");
  });

  it("preserves other body fields", () => {
    const input: SerializableTriggerChunkedRequest = {
      workflowKey: "test-workflow",
      body: {
        recipients: ["user-1"],
        data: { message: "Hello" },
        cancellationKey: "cancel-123",
        workplaceId: "workplace-456",
      },
      expiresAt: "2024-01-01T00:00:00.000Z",
    };

    const actual = toTriggerChunkedRequest(input, mockParams);

    expect(actual.body.data).toEqual({ message: "Hello" });
    expect(actual.body.cancellationKey).toBe("cancel-123");
    expect(actual.body.workplaceId).toBe("workplace-456");
  });

  it("preserves other request fields", () => {
    const input: SerializableTriggerChunkedRequest = {
      workflowKey: "test-workflow",
      body: { recipients: ["user-1"] },
      expiresAt: "2024-01-01T00:00:00.000Z",
      dryRun: true,
      keysToRedact: ["secret"],
    };

    const actual = toTriggerChunkedRequest(input, mockParams);

    expect(actual.dryRun).toBe(true);
    expect(actual.keysToRedact).toEqual(["secret"]);
  });
});
