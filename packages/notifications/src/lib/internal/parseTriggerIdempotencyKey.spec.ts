import {
  DO_NOT_CALL_THIS_OUTSIDE_OF_TESTS,
  type TriggerIdempotencyKey,
  type TriggerIdempotencyKeyParams,
} from "../triggerIdempotencyKey";
import { parseTriggerIdempotencyKey } from "./parseTriggerIdempotencyKey";
import { triggerIdempotencyKeyParamsToHash } from "./triggerIdempotencyKeyParamsToHash";

describe("parseTriggerIdempotencyKey", () => {
  describe("with valid branded TriggerIdempotencyKey", () => {
    it("parses and returns hash for valid params without workplaceId", () => {
      const params: TriggerIdempotencyKeyParams = {
        chunk: 1,
        workflowKey: "test-workflow",
        recipients: ["user1", "user2"],
        resourceId: "resource-123",
      };
      const idempotencyKey = DO_NOT_CALL_THIS_OUTSIDE_OF_TESTS(params);
      const expected = triggerIdempotencyKeyParamsToHash(params);

      const actual = parseTriggerIdempotencyKey({ idempotencyKey });

      expect(actual).toBe(expected);
    });

    it("parses and returns hash for valid params with workplaceId", () => {
      const params: TriggerIdempotencyKeyParams = {
        chunk: 1,
        workflowKey: "test-workflow",
        recipients: ["user1", "user2"],
        resourceId: "resource-123",
      };
      const idempotencyKey = DO_NOT_CALL_THIS_OUTSIDE_OF_TESTS(params);
      const workplaceId = "workplace-456";
      const expected = triggerIdempotencyKeyParamsToHash({ ...params, workplaceId });

      const actual = parseTriggerIdempotencyKey({ idempotencyKey, workplaceId });

      expect(actual).toBe(expected);
    });

    it("parses params with eventOccurredAt", () => {
      const params: TriggerIdempotencyKeyParams = {
        chunk: 1,
        workflowKey: "test-workflow",
        recipients: ["user1"],
        eventOccurredAt: "2025-01-01T00:00:00.000Z",
      };
      const idempotencyKey = DO_NOT_CALL_THIS_OUTSIDE_OF_TESTS(params);
      const expected = triggerIdempotencyKeyParamsToHash(params);

      const actual = parseTriggerIdempotencyKey({ idempotencyKey });

      expect(actual).toBe(expected);
    });
  });

  describe("with invalid branded TriggerIdempotencyKey", () => {
    it("returns original string when JSON is valid but missing required fields", () => {
      const invalidJson = JSON.stringify({ chunk: 1, workflowKey: "test" });
      const input = invalidJson as TriggerIdempotencyKey;

      const actual = parseTriggerIdempotencyKey({ idempotencyKey: input });

      expect(actual).toBe(invalidJson);
    });

    it("returns original string when JSON has invalid recipients type", () => {
      const invalidJson = JSON.stringify({
        chunk: 1,
        workflowKey: "test",
        recipients: "not-an-array",
      });
      const input = invalidJson as TriggerIdempotencyKey;

      const actual = parseTriggerIdempotencyKey({ idempotencyKey: input });

      expect(actual).toBe(invalidJson);
    });

    it("returns original string when JSON has non-string values in recipients", () => {
      const invalidJson = JSON.stringify({
        chunk: 1,
        workflowKey: "test",
        recipients: ["user1", 123, "user3"],
      });
      const input = invalidJson as TriggerIdempotencyKey;

      const actual = parseTriggerIdempotencyKey({ idempotencyKey: input });

      expect(actual).toBe(invalidJson);
    });
  });

  describe("with non-JSON idempotency key", () => {
    it("returns original string when idempotency key is not JSON", () => {
      const input = "plain-string-key" as TriggerIdempotencyKey;

      const actual = parseTriggerIdempotencyKey({ idempotencyKey: input });

      expect(actual).toBe(input);
    });

    it("returns original string when idempotency key is invalid JSON", () => {
      const input = "{invalid json}" as TriggerIdempotencyKey;

      const actual = parseTriggerIdempotencyKey({ idempotencyKey: input });

      expect(actual).toBe(input);
    });

    it("returns original string when idempotency key is empty", () => {
      const input = "" as TriggerIdempotencyKey;

      const actual = parseTriggerIdempotencyKey({ idempotencyKey: input });

      expect(actual).toBe(input);
    });
  });
});
