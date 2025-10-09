import { type BackgroundJobsAdapter } from "@clipboard-health/background-jobs-adapter";

import { chunkRecipients } from "./internal/chunkRecipients";
import { ERROR_CODES, MAXIMUM_RECIPIENTS_COUNT } from "./notificationClient";
import {
  type NotificationJobData,
  NotificationJobEnqueuer,
  RETRYABLE_ERRORS,
} from "./notificationJobEnqueuer";
import { TriggerIdempotencyKey } from "./triggerIdempotencyKey";

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
    const mockRecipients = Array.from({ length: 1001 }, (_, index) => `user-${index + 1}`);
    const mockIdempotencyKey = TriggerIdempotencyKey.DO_NOT_CALL_THIS_OUTSIDE_OF_TESTS({
      chunk: 1,
      recipients: mockRecipients,
      workflowKey: mockWorkflowKey,
    });
    const mockExpiresAt = new Date("2025-12-31");

    const mockData: NotificationJobData = {
      idempotencyKey: mockIdempotencyKey,
      expiresAt: mockExpiresAt,
      recipients: mockRecipients,
      workflowKey: mockWorkflowKey,
    };

    it("enqueues single job when recipients fit in one chunk", async () => {
      const mockChunks = [
        {
          number: 1,
          recipients: mockRecipients,
        },
      ];

      (chunkRecipients as jest.Mock).mockReturnValue(mockChunks);

      const instance = new NotificationJobEnqueuer({ adapter: mockAdapter });

      await instance.enqueueOneOrMore(mockHandler, mockData);

      expect(chunkRecipients).toHaveBeenCalledWith({
        recipients: mockRecipients,
      });
      expect(mockEnqueue).toHaveBeenCalledTimes(1);
      expect(mockEnqueue).toHaveBeenCalledWith(
        mockHandler,
        expect.objectContaining({
          idempotencyKey: expect.any(TriggerIdempotencyKey),
          recipients: mockRecipients,
          expiresAt: mockExpiresAt,
        }),
        expect.objectContaining({
          idempotencyKey: expect.any(String),
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

      (chunkRecipients as jest.Mock).mockReturnValue(mockChunks);

      const instance = new NotificationJobEnqueuer({ adapter: mockAdapter });

      await instance.enqueueOneOrMore(mockHandler, mockData);

      expect(chunkRecipients).toHaveBeenCalledWith({
        recipients: mockRecipients,
      });
      expect(mockEnqueue).toHaveBeenCalledTimes(2);
      expect(mockEnqueue).toHaveBeenNthCalledWith(
        1,
        mockHandler,
        expect.objectContaining({
          idempotencyKey: expect.any(TriggerIdempotencyKey),
          recipients: mockRecipients.slice(0, MAXIMUM_RECIPIENTS_COUNT),
          expiresAt: mockExpiresAt,
        }),
        expect.objectContaining({
          idempotencyKey: expect.any(String),
        }),
      );
      expect(mockEnqueue).toHaveBeenNthCalledWith(
        2,
        mockHandler,
        expect.objectContaining({
          idempotencyKey: expect.any(TriggerIdempotencyKey),
          recipients: mockRecipients.slice(MAXIMUM_RECIPIENTS_COUNT, MAXIMUM_RECIPIENTS_COUNT + 1),
          expiresAt: mockExpiresAt,
        }),
        expect.objectContaining({
          idempotencyKey: expect.any(String),
        }),
      );
    });

    it("includes additional data properties in enqueued jobs", async () => {
      interface CustomJobData extends NotificationJobData {
        customField: string;
        anotherField: number;
      }

      const mockRecipients = ["user-1"];
      const mockData: CustomJobData = {
        idempotencyKey: mockIdempotencyKey,
        expiresAt: mockExpiresAt,
        recipients: mockRecipients,
        workflowKey: mockWorkflowKey,
        customField: "test-value",
        anotherField: 42,
      };

      const mockChunks = [
        {
          number: 1,
          recipients: mockRecipients,
        },
      ];

      (chunkRecipients as jest.Mock).mockReturnValue(mockChunks);

      const instance = new NotificationJobEnqueuer({ adapter: mockAdapter });

      await instance.enqueueOneOrMore(mockHandler, mockData);

      expect(mockEnqueue).toHaveBeenCalledWith(
        mockHandler,
        expect.objectContaining({
          idempotencyKey: expect.any(TriggerIdempotencyKey),
          recipients: mockRecipients,
          expiresAt: mockExpiresAt,
          customField: "test-value",
          anotherField: 42,
        }),
        expect.objectContaining({
          idempotencyKey: expect.any(String),
        }),
      );
    });

    it("passes through enqueue options when provided", async () => {
      const mockRecipients = ["user-1"];
      const mockData: NotificationJobData = {
        idempotencyKey: mockIdempotencyKey,
        expiresAt: mockExpiresAt,
        recipients: mockRecipients,
        workflowKey: mockWorkflowKey,
      };

      const mockOptions = {
        delay: 5000,
        priority: 10,
      };

      const mockChunks = [
        {
          number: 1,
          recipients: mockRecipients,
        },
      ];

      (chunkRecipients as jest.Mock).mockReturnValue(mockChunks);

      const instance = new NotificationJobEnqueuer({ adapter: mockAdapter });

      await instance.enqueueOneOrMore(mockHandler, mockData, mockOptions);

      expect(mockEnqueue).toHaveBeenCalledWith(
        mockHandler,
        expect.objectContaining({
          idempotencyKey: expect.any(TriggerIdempotencyKey),
          recipients: mockRecipients,
          expiresAt: mockExpiresAt,
        }),
        expect.objectContaining({
          delay: 5000,
          priority: 10,
          idempotencyKey: expect.any(String),
        }),
      );
    });

    it("handles empty recipients array", async () => {
      const mockData: NotificationJobData = {
        idempotencyKey: mockIdempotencyKey,
        expiresAt: mockExpiresAt,
        recipients: [],
        workflowKey: mockWorkflowKey,
      };

      const mockChunks = [
        {
          number: 1,
          recipients: [],
        },
      ];

      (chunkRecipients as jest.Mock).mockReturnValue(mockChunks);

      const instance = new NotificationJobEnqueuer({ adapter: mockAdapter });

      await instance.enqueueOneOrMore(mockHandler, mockData);

      expect(chunkRecipients).toHaveBeenCalledWith({
        recipients: [],
      });
      expect(mockEnqueue).toHaveBeenCalledTimes(1);
    });
  });

  describe("RETRYABLE_ERRORS", () => {
    it("exports only unknown error code as retryable", () => {
      expect(RETRYABLE_ERRORS).toEqual([ERROR_CODES.unknown]);
    });

    it("RETRYABLE_ERRORS contains only valid error codes", () => {
      const validErrorCodes = Object.values(ERROR_CODES);

      for (const errorCode of RETRYABLE_ERRORS) {
        expect(validErrorCodes).toContain(errorCode);
      }
    });
  });
});
