import { type BackgroundJobsAdapter } from "@clipboard-health/background-jobs-adapter";

import { chunkRecipients } from "./internal/chunkRecipients";
import { triggerIdempotencyKeyParamsToHash } from "./internal/triggerIdempotencyKeyParamsToHash";
import { MAXIMUM_RECIPIENTS_COUNT } from "./notificationClient";
import { NotificationJobEnqueuer } from "./notificationJobEnqueuer";
import {
  DO_NOT_CALL_THIS_OUTSIDE_OF_TESTS,
  type TriggerIdempotencyKeyParams,
} from "./triggerIdempotencyKey";

jest.mock("./internal/chunkRecipients");

describe("NotificationJobEnqueuer", () => {
  const mockEnqueue = jest.fn();
  const mockAdapter: BackgroundJobsAdapter = {
    implementation: "postgres",
    enqueue: mockEnqueue,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("constructor", () => {
    it("creates instance with provided adapter", () => {
      const instance = new NotificationJobEnqueuer({ adapter: mockAdapter });

      expect(instance).toBeInstanceOf(NotificationJobEnqueuer);
    });
  });

  describe("enqueueOneOrMore", () => {
    const mockHandler = "my-handler";
    const mockWorkflowKey = "my-workflow-key";
    const mockRecipients = Array.from({ length: 1001 }, (_, index) => `u${index + 1}`);
    const mockIdempotencyKey = {
      resourceId: "my-resource-id",
    };
    const mockTriggerIdempotencyKey: TriggerIdempotencyKeyParams = {
      ...mockIdempotencyKey,
      chunk: 1,
      recipients: mockRecipients,
      workflowKey: mockWorkflowKey,
    };

    const mockTriggerIdempotencyKeyHash =
      triggerIdempotencyKeyParamsToHash(mockTriggerIdempotencyKey);
    const mockExpiresAt = new Date("2025-12-31").toISOString();

    it("enqueues single job when recipients fit in one chunk", async () => {
      const mockChunks = [
        {
          number: 1,
          recipients: mockRecipients,
        },
      ];

      (chunkRecipients as jest.Mock).mockReturnValue(mockChunks);

      const instance = new NotificationJobEnqueuer({ adapter: mockAdapter });

      await instance.enqueueOneOrMore(mockHandler, {
        idempotencyKey: mockIdempotencyKey,
        expiresAt: mockExpiresAt,
        recipients: mockRecipients,
        workflowKey: mockWorkflowKey,
      });

      expect(chunkRecipients).toHaveBeenCalledWith({
        recipients: mockRecipients,
      });
      expect(mockEnqueue).toHaveBeenCalledTimes(1);
      expect(mockEnqueue).toHaveBeenCalledWith(
        mockHandler,
        expect.objectContaining({
          idempotencyKey: DO_NOT_CALL_THIS_OUTSIDE_OF_TESTS(mockTriggerIdempotencyKey),
          recipients: mockRecipients,
          expiresAt: mockExpiresAt,
        }),
        expect.objectContaining({
          idempotencyKey: mockTriggerIdempotencyKeyHash,
        }),
      );
    });

    it("enqueues multiple jobs when recipients require chunking", async () => {
      const mockChunks = [
        {
          number: 1,
          recipients: mockRecipients.slice(0, MAXIMUM_RECIPIENTS_COUNT),
        },
        {
          number: 2,
          recipients: mockRecipients.slice(MAXIMUM_RECIPIENTS_COUNT, MAXIMUM_RECIPIENTS_COUNT + 1),
        },
      ];

      const mockKey1: TriggerIdempotencyKeyParams = {
        ...mockIdempotencyKey,
        chunk: 1,
        recipients: mockChunks[0]!.recipients,
        workflowKey: mockWorkflowKey,
      };
      const mockKey2: TriggerIdempotencyKeyParams = {
        ...mockIdempotencyKey,
        chunk: 2,
        recipients: mockChunks[1]!.recipients,
        workflowKey: mockWorkflowKey,
      };

      (chunkRecipients as jest.Mock).mockReturnValue(mockChunks);

      const instance = new NotificationJobEnqueuer({ adapter: mockAdapter });

      await instance.enqueueOneOrMore(mockHandler, {
        idempotencyKey: mockIdempotencyKey,
        expiresAt: mockExpiresAt,
        recipients: mockRecipients,
        workflowKey: mockWorkflowKey,
      });

      expect(chunkRecipients).toHaveBeenCalledWith({
        recipients: mockRecipients,
      });
      expect(mockEnqueue).toHaveBeenCalledTimes(2);
      expect(mockEnqueue).toHaveBeenNthCalledWith(
        1,
        mockHandler,
        expect.objectContaining({
          idempotencyKey: DO_NOT_CALL_THIS_OUTSIDE_OF_TESTS(mockKey1),
          recipients: mockRecipients.slice(0, MAXIMUM_RECIPIENTS_COUNT),
          expiresAt: mockExpiresAt,
        }),
        expect.objectContaining({
          idempotencyKey: triggerIdempotencyKeyParamsToHash(mockKey1),
        }),
      );
      expect(mockEnqueue).toHaveBeenNthCalledWith(
        2,
        mockHandler,
        expect.objectContaining({
          idempotencyKey: DO_NOT_CALL_THIS_OUTSIDE_OF_TESTS(mockKey2),
          recipients: mockRecipients.slice(MAXIMUM_RECIPIENTS_COUNT, MAXIMUM_RECIPIENTS_COUNT + 1),
          expiresAt: mockExpiresAt,
        }),
        expect.objectContaining({
          idempotencyKey: triggerIdempotencyKeyParamsToHash(mockKey2),
        }),
      );
    });

    it("includes additional data properties in enqueued jobs", async () => {
      const mockChunks = [{ number: 1, recipients: mockRecipients }];

      (chunkRecipients as jest.Mock).mockReturnValue(mockChunks);

      const instance = new NotificationJobEnqueuer({ adapter: mockAdapter });

      await instance.enqueueOneOrMore(mockHandler, {
        idempotencyKey: mockIdempotencyKey,
        expiresAt: mockExpiresAt,
        recipients: mockRecipients,
        workflowKey: mockWorkflowKey,
        customField: "test-value",
        anotherField: 42,
      });

      expect(mockEnqueue).toHaveBeenCalledWith(
        mockHandler,
        expect.objectContaining({
          idempotencyKey: DO_NOT_CALL_THIS_OUTSIDE_OF_TESTS(mockTriggerIdempotencyKey),
          recipients: mockRecipients,
          expiresAt: mockExpiresAt,
          customField: "test-value",
          anotherField: 42,
        }),
        expect.objectContaining({
          idempotencyKey: mockTriggerIdempotencyKeyHash,
        }),
      );
    });

    it("passes through enqueue options when provided", async () => {
      const mockOptions = { delay: 5000, priority: 10 };
      const mockChunks = [{ number: 1, recipients: mockRecipients }];

      (chunkRecipients as jest.Mock).mockReturnValue(mockChunks);

      const instance = new NotificationJobEnqueuer({ adapter: mockAdapter });

      await instance.enqueueOneOrMore(
        mockHandler,
        {
          idempotencyKey: mockIdempotencyKey,
          expiresAt: mockExpiresAt,
          recipients: mockRecipients,
          workflowKey: mockWorkflowKey,
        },
        mockOptions,
      );

      expect(mockEnqueue).toHaveBeenCalledWith(
        mockHandler,
        expect.objectContaining({
          idempotencyKey: DO_NOT_CALL_THIS_OUTSIDE_OF_TESTS(mockTriggerIdempotencyKey),
          recipients: mockRecipients,
          expiresAt: mockExpiresAt,
        }),
        expect.objectContaining({
          delay: 5000,
          priority: 10,
          idempotencyKey: mockTriggerIdempotencyKeyHash,
        }),
      );
    });

    it("handles empty recipients array", async () => {
      const mockChunks = [
        {
          number: 1,
          recipients: [],
        },
      ];

      (chunkRecipients as jest.Mock).mockReturnValue(mockChunks);

      const instance = new NotificationJobEnqueuer({ adapter: mockAdapter });

      await instance.enqueueOneOrMore(mockHandler, {
        idempotencyKey: mockIdempotencyKey,
        expiresAt: mockExpiresAt,
        recipients: [],
        workflowKey: mockWorkflowKey,
      });

      expect(chunkRecipients).toHaveBeenCalledWith({ recipients: [] });
      expect(mockEnqueue).toHaveBeenCalledTimes(1);
    });
  });
});
