import {
  DO_NOT_CALL_THIS_OUTSIDE_OF_TESTS,
  type TriggerIdempotencyKey,
  type TriggerIdempotencyKeyParams,
} from "../triggerIdempotencyKey";
import { parseTriggerIdempotencyKey } from "./parseTriggerIdempotencyKey";

describe("parseTriggerIdempotencyKey", () => {
  describe("with valid branded TriggerIdempotencyKey", () => {
    it("parses and returns params for valid key", () => {
      const params: TriggerIdempotencyKeyParams = {
        chunk: 1,
        workflowKey: "test-workflow",
        recipients: ["user1", "user2"],
        resourceId: "resource-123",
      };
      const idempotencyKey = DO_NOT_CALL_THIS_OUTSIDE_OF_TESTS(params);

      const actual = parseTriggerIdempotencyKey({ idempotencyKey });

      expect(actual).toEqual(params);
    });

    it("parses params with eventOccurredAt", () => {
      const params: TriggerIdempotencyKeyParams = {
        chunk: 1,
        workflowKey: "test-workflow",
        recipients: ["user1"],
        eventOccurredAt: "2025-01-01T00:00:00.000Z",
      };
      const idempotencyKey = DO_NOT_CALL_THIS_OUTSIDE_OF_TESTS(params);

      const actual = parseTriggerIdempotencyKey({ idempotencyKey });

      expect(actual).toEqual(params);
    });
  });

  describe("with invalid branded TriggerIdempotencyKey", () => {
    it("returns false when JSON is valid but missing required fields", () => {
      const invalidJson = JSON.stringify({ chunk: 1, workflowKey: "test" });
      const input = invalidJson as TriggerIdempotencyKey;

      const actual = parseTriggerIdempotencyKey({ idempotencyKey: input });

      expect(actual).toBe(false);
    });

    it("returns false when JSON has invalid recipients type", () => {
      const invalidJson = JSON.stringify({
        chunk: 1,
        workflowKey: "test",
        recipients: "not-an-array",
      });
      const input = invalidJson as TriggerIdempotencyKey;

      const actual = parseTriggerIdempotencyKey({ idempotencyKey: input });

      expect(actual).toBe(false);
    });

    it("returns false when JSON has non-string values in recipients", () => {
      const invalidJson = JSON.stringify({
        chunk: 1,
        workflowKey: "test",
        recipients: ["user1", 123, "user3"],
      });
      const input = invalidJson as TriggerIdempotencyKey;

      const actual = parseTriggerIdempotencyKey({ idempotencyKey: input });

      expect(actual).toBe(false);
    });
  });

  describe("with non-JSON idempotency key", () => {
    it("returns false when idempotency key is not JSON", () => {
      const input = "plain-string-key" as TriggerIdempotencyKey;

      const actual = parseTriggerIdempotencyKey({ idempotencyKey: input });

      expect(actual).toBe(false);
    });

    it("returns false when idempotency key is invalid JSON", () => {
      const input = "{invalid json}" as TriggerIdempotencyKey;

      const actual = parseTriggerIdempotencyKey({ idempotencyKey: input });

      expect(actual).toBe(false);
    });

    it("returns false when idempotency key is empty", () => {
      const input = "" as TriggerIdempotencyKey;

      const actual = parseTriggerIdempotencyKey({ idempotencyKey: input });

      expect(actual).toBe(false);
    });
  });
});
