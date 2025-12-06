import { triggerIdempotencyKeyParamsToHash } from "./triggerIdempotencyKeyParamsToHash";

describe("triggerIdempotencyKeyParamsToHash", () => {
  const baseParams = {
    chunk: 1,
    recipients: ["user1", "user2"],
    workflowKey: "test-workflow",
  };

  describe("resourceId extraction", () => {
    it("extracts resourceId from legacy IdempotencyKey format", () => {
      const input = {
        ...baseParams,
        resourceId: "resource-123",
      };

      const actual = triggerIdempotencyKeyParamsToHash(input);

      expect(actual).toHaveLength(64);
    });

    it("extracts resourceId from IdempotencyKeyParts.resource.id", () => {
      const input = {
        ...baseParams,
        resource: { type: "account", id: "resource-456" },
      };

      const actual = triggerIdempotencyKeyParamsToHash(input);

      expect(actual).toHaveLength(64);
    });

    it("produces same hash for equivalent resourceId values", () => {
      const legacyInput = {
        ...baseParams,
        resourceId: "same-id",
      };
      const newInput = {
        ...baseParams,
        resource: { type: "account", id: "same-id" },
      };

      const actualLegacy = triggerIdempotencyKeyParamsToHash(legacyInput);
      const actualNew = triggerIdempotencyKeyParamsToHash(newInput);

      expect(actualLegacy).toBe(actualNew);
    });

    it("handles eventOccurredAt without resourceId", () => {
      const input = {
        ...baseParams,
        eventOccurredAt: "2024-01-01T00:00:00.000Z",
      };

      const actual = triggerIdempotencyKeyParamsToHash(input);

      expect(actual).toHaveLength(64);
    });
  });

  describe("deterministic hashing", () => {
    it("produces same hash for same input", () => {
      const input = {
        ...baseParams,
        resourceId: "resource-123",
      };

      const actual1 = triggerIdempotencyKeyParamsToHash(input);
      const actual2 = triggerIdempotencyKeyParamsToHash(input);

      expect(actual1).toBe(actual2);
    });

    it("produces same hash regardless of recipients order", () => {
      const input1 = {
        ...baseParams,
        recipients: ["user1", "user2", "user3"],
        resourceId: "resource-123",
      };
      const input2 = {
        ...baseParams,
        recipients: ["user3", "user1", "user2"],
        resourceId: "resource-123",
      };

      const actual1 = triggerIdempotencyKeyParamsToHash(input1);
      const actual2 = triggerIdempotencyKeyParamsToHash(input2);

      expect(actual1).toBe(actual2);
    });

    it("produces different hash for different resourceId", () => {
      const input1 = {
        ...baseParams,
        resourceId: "resource-123",
      };
      const input2 = {
        ...baseParams,
        resourceId: "resource-456",
      };

      const actual1 = triggerIdempotencyKeyParamsToHash(input1);
      const actual2 = triggerIdempotencyKeyParamsToHash(input2);

      expect(actual1).not.toBe(actual2);
    });
  });

  describe("workplaceId", () => {
    it("includes workplaceId in hash when provided", () => {
      const inputWithoutWorkplace = {
        ...baseParams,
        resourceId: "resource-123",
      };
      const inputWithWorkplace = {
        ...baseParams,
        resourceId: "resource-123",
        workplaceId: "workplace-1",
      };

      const actual1 = triggerIdempotencyKeyParamsToHash(inputWithoutWorkplace);
      const actual2 = triggerIdempotencyKeyParamsToHash(inputWithWorkplace);

      expect(actual1).not.toBe(actual2);
    });
  });
});
