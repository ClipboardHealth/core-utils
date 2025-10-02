import { expectToBeFailure, expectToBeSuccess } from "@clipboard-health/testing-core";
import { type Logger, ServiceError } from "@clipboard-health/util-ts";
import { type Knock } from "@knocklabs/node";

import { IdempotentKnock } from "./internal/idempotentKnock";
import { NotificationClient } from "./notificationClient";
import type { SignUserTokenRequest, Tracer, TriggerRequest, UpsertWorkplaceRequest } from "./types";

type SetChannelDataResponse = Awaited<ReturnType<Knock["users"]["setChannelData"]>>;
type GetChannelDataResponse = Awaited<ReturnType<Knock["users"]["getChannelData"]>>;

describe("NotificationClient", () => {
  let client: NotificationClient;
  let mockLogger: jest.Mocked<Logger>;
  let mockTracer: jest.Mocked<Tracer>;
  let provider: IdempotentKnock;

  beforeEach(() => {
    mockLogger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    };
    mockTracer = {
      trace: jest
        .fn()
        .mockImplementation((_name, _options, fun) => fun({ addTags: jest.fn() }) as unknown),
    };
    provider = new IdempotentKnock({ apiKey: "test-api-key", logger: mockLogger });

    client = new NotificationClient({
      logger: mockLogger,
      provider,
      tracer: mockTracer,
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("constructor", () => {
    it("creates Knock instance with correct configuration", () => {
      const client = new NotificationClient({
        logger: mockLogger,
        provider,
        tracer: mockTracer,
      });

      expect(client).toBeDefined();
    });

    it("creates Knock instance with apiKey", () => {
      const client = new NotificationClient({
        logger: mockLogger,
        apiKey: "test-api-key",
        tracer: mockTracer,
      });

      expect(client).toBeDefined();
    });
  });

  describe("trigger", () => {
    const mockWorkflowKey = "test-workflow";
    const mockIdempotencyKey = "idempotent-456";
    const mockAttempt = 1;
    const mockExpiresAt = new Date(Date.now() + 300_000);
    const mockWorkflowRunId = "workflow-run-789";

    it("triggers workflow successfully", async () => {
      const mockBody = {
        recipients: [{ userId: "user-1" }, { userId: "user-2" }],
        data: { message: "Hello world" },
      };
      const mockResponse = { workflow_run_id: mockWorkflowRunId };
      const triggerSpy = jest.spyOn(provider.workflows, "trigger").mockResolvedValue(mockResponse);

      const input: TriggerRequest = {
        key: mockWorkflowKey,
        body: mockBody,
        idempotencyKey: mockIdempotencyKey,
        keysToRedact: [],
        expiresAt: mockExpiresAt,
        attempt: mockAttempt,
      };

      const actual = await client.trigger(input);

      expectToBeSuccess(actual);
      expect(actual.value.id).toBe(mockWorkflowRunId);
      expect(actual.value.ids).toEqual([mockWorkflowRunId]);

      expect(triggerSpy).toHaveBeenCalledWith(
        mockWorkflowKey,
        {
          recipients: [{ id: "user-1" }, { id: "user-2" }],
          data: { message: "Hello world" },
        },
        {
          idempotencyKey: mockIdempotencyKey,
        },
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        "notifications.trigger request",
        expect.any(Object),
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        "notifications.trigger response",
        expect.any(Object),
      );
    });

    it("rejects expired request", async () => {
      const mockExpiredDate = new Date(Date.now() - 1000);
      const triggerSpy = jest.spyOn(provider.workflows, "trigger");

      const input: TriggerRequest = {
        key: mockWorkflowKey,
        body: { recipients: [{ userId: "user-1" }] },
        idempotencyKey: mockIdempotencyKey,
        keysToRedact: [],
        expiresAt: mockExpiredDate,
        attempt: mockAttempt,
      };

      const actual = await client.trigger(input);

      expectToBeFailure(actual);
      expect(actual.error.message).toContain("notification expires at");

      expect(triggerSpy).not.toHaveBeenCalled();
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringMatching(
          /^notifications\.trigger \[expired] Got .+; notification expires at .+\.$/,
        ),
        expect.any(Object),
      );
    });

    it("handles Knock API error", async () => {
      const mockError = new Error("Knock API error");
      jest.spyOn(provider.workflows, "trigger").mockRejectedValue(mockError);

      const input: TriggerRequest = {
        key: mockWorkflowKey,
        body: { recipients: [{ userId: "user-1" }] },
        idempotencyKey: mockIdempotencyKey,
        keysToRedact: [],
        expiresAt: mockExpiresAt,
        attempt: mockAttempt,
      };

      const actual = await client.trigger(input);

      expectToBeFailure(actual);
      expect(actual.error).toEqual(
        new ServiceError({ issues: [{ code: "unknown", message: mockError.message }] }),
      );

      expect(mockLogger.error).toHaveBeenCalledWith(
        "notifications.trigger [unknown] Knock API error",
        expect.any(Object),
      );
    });

    it("redacts sensitive data in logs", async () => {
      const mockBody = {
        recipients: [{ userId: "user-1" }],
        data: {
          publicInfo: "visible",
          secretKey: "should-be-redacted",
          nested: {
            publicNested: "visible",
            secretKey: "should-be-redacted-too",
          },
        },
      };
      const mockResponse = { workflow_run_id: mockWorkflowRunId };
      jest.spyOn(provider.workflows, "trigger").mockResolvedValue(mockResponse);

      const input: TriggerRequest = {
        key: mockWorkflowKey,
        body: mockBody,
        idempotencyKey: mockIdempotencyKey,
        keysToRedact: ["secretKey"],
        expiresAt: mockExpiresAt,
        attempt: mockAttempt,
      };

      const actual = await client.trigger(input);

      expectToBeSuccess(actual);
      expect(mockLogger.info).toHaveBeenCalledWith(
        "notifications.trigger request",
        expect.objectContaining({
          redactedBody: {
            recipients: 1,
            data: {
              publicInfo: "visible",
              secretKey: "[REDACTED]",
              nested: {
                publicNested: "visible",
                secretKey: "[REDACTED]",
              },
            },
          },
        }),
      );
    });

    it("handles undefined data in body", async () => {
      const mockBody = { recipients: [{ userId: "user-1" }] };
      const mockResponse = { workflow_run_id: mockWorkflowRunId };
      jest.spyOn(provider.workflows, "trigger").mockResolvedValue(mockResponse);

      const input: TriggerRequest = {
        key: mockWorkflowKey,
        body: mockBody,
        idempotencyKey: mockIdempotencyKey,
        keysToRedact: ["secretKey"],
        expiresAt: mockExpiresAt,
        attempt: mockAttempt,
      };

      const actual = await client.trigger(input);

      expectToBeSuccess(actual);
      expect(mockLogger.info).toHaveBeenCalledWith(
        "notifications.trigger request",
        expect.objectContaining({
          redactedBody: {
            recipients: 1,
            data: undefined,
          },
        }),
      );
    });

    it("traces workflow execution with correct tags", async () => {
      const mockBody = { recipients: [{ userId: "user-1" }] };
      const mockResponse = { workflow_run_id: mockWorkflowRunId };
      jest.spyOn(provider.workflows, "trigger").mockResolvedValue(mockResponse);
      const mockSpan = { addTags: jest.fn() };
      mockTracer.trace.mockImplementation((_name, _options, fun) => fun(mockSpan));

      const input: TriggerRequest = {
        key: mockWorkflowKey,
        body: mockBody,
        idempotencyKey: mockIdempotencyKey,
        keysToRedact: [],
        expiresAt: mockExpiresAt,
        attempt: mockAttempt,
      };

      const actual = await client.trigger(input);

      expectToBeSuccess(actual);
      expect(mockTracer.trace).toHaveBeenCalledWith(
        "notifications.trigger",
        {
          resource: `notification.${mockWorkflowKey}`,
          tags: expect.objectContaining({
            "span.kind": "producer",
            component: "customer-notifications",
            "messaging.system": "knock.app",
            "messaging.destination": "knock.workflows.trigger",
            "messaging.operation": "publish",
            "notification.attempt": "1",
          }),
        },
        expect.any(Function),
      );
      expect(mockSpan.addTags).toHaveBeenCalledWith({
        "response.id": mockWorkflowRunId,
        success: true,
      });
    });

    it("handles string recipients in trigger body", async () => {
      const mockBody = { recipients: ["user-1", "user-2"] };
      const mockResponse = { workflow_run_id: mockWorkflowRunId };
      jest.spyOn(provider.workflows, "trigger").mockResolvedValue(mockResponse);

      const input: TriggerRequest = {
        key: mockWorkflowKey,
        body: mockBody,
        idempotencyKey: mockIdempotencyKey,
        keysToRedact: [],
        expiresAt: mockExpiresAt,
        attempt: mockAttempt,
      };

      const actual = await client.trigger(input);

      expectToBeSuccess(actual);
      expect(actual.value.id).toBe(mockWorkflowRunId);
    });

    it("handles body with no actor or cancellation key", async () => {
      const mockBody = { recipients: [{ userId: "user-1" }] };
      const mockResponse = { workflow_run_id: mockWorkflowRunId };
      jest.spyOn(provider.workflows, "trigger").mockResolvedValue(mockResponse);

      const input: TriggerRequest = {
        key: mockWorkflowKey,
        body: mockBody,
        idempotencyKey: mockIdempotencyKey,
        keysToRedact: [],
        expiresAt: mockExpiresAt,
        attempt: mockAttempt,
      };

      const actual = await client.trigger(input);

      expectToBeSuccess(actual);
      expect(actual.value.id).toBe(mockWorkflowRunId);
    });

    it("handles recipient with minimal fields", async () => {
      const mockBody = { recipients: [{ userId: "user-1" }] };
      const mockResponse = { workflow_run_id: mockWorkflowRunId };
      jest.spyOn(provider.workflows, "trigger").mockResolvedValue(mockResponse);

      const input: TriggerRequest = {
        key: mockWorkflowKey,
        body: mockBody,
        idempotencyKey: mockIdempotencyKey,
        keysToRedact: [],
        expiresAt: mockExpiresAt,
        attempt: mockAttempt,
      };

      const actual = await client.trigger(input);

      expectToBeSuccess(actual);
      expect(actual.value.id).toBe(mockWorkflowRunId);
    });

    it("handles body with actor, cancellation key, and full recipient", async () => {
      const mockBody = {
        recipients: [
          {
            userId: "user-1",
            email: "user@example.com",
            name: "User Name",
            phoneNumber: "+1234567890",
            timeZone: "America/New_York",
            createdAt: new Date("2023-01-01"),
            channelData: { push: { tokens: ["token"] } },
          },
        ],
        actor: "actor-1",
        cancellationKey: "cancel-key",
      };
      const mockResponse = { workflow_run_id: mockWorkflowRunId };
      jest.spyOn(provider.workflows, "trigger").mockResolvedValue(mockResponse);

      const input: TriggerRequest = {
        key: mockWorkflowKey,
        body: mockBody,
        idempotencyKey: mockIdempotencyKey,
        keysToRedact: [],
        expiresAt: mockExpiresAt,
        attempt: mockAttempt,
      };

      const actual = await client.trigger(input);

      expectToBeSuccess(actual);
      expect(actual.value.id).toBe(mockWorkflowRunId);
    });

    it("adds error tags to span when request expires", async () => {
      const mockExpiredDate = new Date(Date.now() - 1000);
      const mockSpan = { addTags: jest.fn() };
      mockTracer.trace.mockImplementation((_name, _options, fun) => fun(mockSpan));

      const input: TriggerRequest = {
        key: mockWorkflowKey,
        body: { recipients: [{ userId: "user-1" }] },
        idempotencyKey: mockIdempotencyKey,
        keysToRedact: [],
        expiresAt: mockExpiredDate,
        attempt: mockAttempt,
      };

      const actual = await client.trigger(input);

      expectToBeFailure(actual);
      expect(mockSpan.addTags).toHaveBeenCalledWith({
        error: true,
        "error.type": "expired",
        "error.message": expect.stringContaining("notification expires at"),
      });
    });

    it("adds error tags to span when Knock API fails", async () => {
      const mockError = new Error("Knock API error");
      jest.spyOn(provider.workflows, "trigger").mockRejectedValue(mockError);
      const mockSpan = { addTags: jest.fn() };
      mockTracer.trace.mockImplementation((_name, _options, fun) => fun(mockSpan));

      const input: TriggerRequest = {
        key: mockWorkflowKey,
        body: { recipients: [{ userId: "user-1" }] },
        idempotencyKey: mockIdempotencyKey,
        keysToRedact: [],
        expiresAt: mockExpiresAt,
        attempt: mockAttempt,
      };

      const actual = await client.trigger(input);

      expectToBeFailure(actual);
      expect(mockSpan.addTags).toHaveBeenCalledWith({
        error: true,
        "error.type": "unknown",
        "error.message": "Knock API error",
      });
    });

    it("rejects request with no recipients", async () => {
      const input: TriggerRequest = {
        key: mockWorkflowKey,
        body: { recipients: [] },
        idempotencyKey: mockIdempotencyKey,
        keysToRedact: [],
        expiresAt: mockExpiresAt,
        attempt: mockAttempt,
      };

      const actual = await client.trigger(input);

      expectToBeFailure(actual);
      expect(actual.error.message).toContain("Got 0 recipients; must be > 0");
    });

    it("chunks requests with more than maximum recipients", async () => {
      const recipients = Array.from({ length: 1001 }, (_, index) => ({ userId: `user-${index}` }));
      const mockResponse1 = { workflow_run_id: "workflow-run-1" };
      const mockResponse2 = { workflow_run_id: "workflow-run-2" };
      const triggerSpy = jest
        .spyOn(provider.workflows, "trigger")
        .mockResolvedValueOnce(mockResponse1)
        .mockResolvedValueOnce(mockResponse2);

      const input: TriggerRequest = {
        key: mockWorkflowKey,
        body: { recipients },
        idempotencyKey: mockIdempotencyKey,
        keysToRedact: [],
        expiresAt: mockExpiresAt,
        attempt: mockAttempt,
      };

      const actual = await client.trigger(input);

      expectToBeSuccess(actual);
      expect(actual.value.id).toBe("workflow-run-1"); // Returns first chunk's ID
      expect(actual.value.ids).toEqual(["workflow-run-1", "workflow-run-2"]); // Returns all IDs

      // Should have triggered twice (1000 recipients in first chunk, 1 in second)
      expect(triggerSpy).toHaveBeenCalledTimes(2);

      // First chunk should use idempotency key with -chunk-1
      expect(triggerSpy).toHaveBeenNthCalledWith(
        1,
        mockWorkflowKey,
        expect.objectContaining({
          recipients: expect.any(Array),
        }),
        {
          idempotencyKey: `${mockIdempotencyKey}-chunk-1`,
        },
      );

      // Second chunk should use idempotency key with -chunk-2
      expect(triggerSpy).toHaveBeenNthCalledWith(
        2,
        mockWorkflowKey,
        expect.objectContaining({
          recipients: expect.any(Array),
        }),
        {
          idempotencyKey: `${mockIdempotencyKey}-chunk-2`,
        },
      );
    });

    it("handles trigger request without keysToRedact", async () => {
      const mockBody = { recipients: [{ userId: "user-1" }] };
      const mockResponse = { workflow_run_id: mockWorkflowRunId };
      jest.spyOn(provider.workflows, "trigger").mockResolvedValue(mockResponse);

      const input: Omit<TriggerRequest, "keysToRedact"> = {
        key: mockWorkflowKey,
        body: mockBody,
        idempotencyKey: mockIdempotencyKey,
        expiresAt: mockExpiresAt,
        attempt: mockAttempt,
      };

      const actual = await client.trigger(input as TriggerRequest);

      expectToBeSuccess(actual);
      expect(actual.value.id).toBe(mockWorkflowRunId);
    });
  });

  describe("appendPushToken", () => {
    const mockUserId = "user-123";
    const mockToken = "push-token-abc";
    const mockChannelId = "channel-id-abc";

    it("appends push token successfully when no existing tokens", async () => {
      const getChannelDataSpy = jest
        .spyOn(provider.users, "getChannelData")
        .mockRejectedValue(createNotFoundError());
      const setChannelDataSpy = jest.spyOn(provider.users, "setChannelData").mockResolvedValue({
        data: { tokens: [mockToken] },
      } as SetChannelDataResponse);

      const result = await client.appendPushToken({
        channelId: mockChannelId,
        userId: mockUserId,
        token: mockToken,
      });

      expectToBeSuccess(result);
      expect(result.value.success).toBe(true);

      expect(getChannelDataSpy).toHaveBeenCalledWith(mockUserId, mockChannelId);
      expect(setChannelDataSpy).toHaveBeenCalledWith(mockUserId, mockChannelId, {
        data: { tokens: [mockToken] },
      });
      expect(mockLogger.info).toHaveBeenCalledWith(
        "notifications.appendPushToken request",
        expect.objectContaining({
          traceName: "notifications.appendPushToken",
          destination: "knock.users.setChannelData",
          userId: mockUserId,
          channelId: mockChannelId,
        }),
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        "notifications.appendPushToken response",
        expect.objectContaining({
          response: { tokenCount: 1 },
        }),
      );
    });

    it("appends push token to existing tokens", async () => {
      const existingTokens = ["existing-token-1", "existing-token-2"];
      jest.spyOn(provider.users, "getChannelData").mockResolvedValue({
        data: { tokens: existingTokens },
      } as GetChannelDataResponse);
      const setChannelDataSpy = jest.spyOn(provider.users, "setChannelData").mockResolvedValue({
        data: { tokens: [...existingTokens, mockToken] },
      } as SetChannelDataResponse);

      const result = await client.appendPushToken({
        channelId: mockChannelId,
        userId: mockUserId,
        token: mockToken,
      });

      expectToBeSuccess(result);
      expect(result.value.success).toBe(true);

      expect(setChannelDataSpy).toHaveBeenCalledWith(mockUserId, mockChannelId, {
        data: { tokens: [...existingTokens, mockToken] },
      });
      expect(mockLogger.info).toHaveBeenCalledWith(
        "notifications.appendPushToken response",
        expect.objectContaining({
          response: { tokenCount: 3 },
        }),
      );
    });

    it("deduplicates tokens when adding existing token", async () => {
      const existingTokens = ["existing-token-1", mockToken];
      jest.spyOn(provider.users, "getChannelData").mockResolvedValue({
        data: { tokens: existingTokens },
      } as GetChannelDataResponse);
      const setChannelDataSpy = jest.spyOn(provider.users, "setChannelData").mockResolvedValue({
        data: { tokens: ["existing-token-1", mockToken] },
      } as SetChannelDataResponse);

      const result = await client.appendPushToken({
        channelId: mockChannelId,
        userId: mockUserId,
        token: mockToken,
      });

      expectToBeSuccess(result);
      expect(result.value.success).toBe(true);

      expect(setChannelDataSpy).toHaveBeenCalledWith(mockUserId, mockChannelId, {
        data: { tokens: ["existing-token-1", mockToken] },
      });
      expect(mockLogger.info).toHaveBeenCalledWith(
        "notifications.appendPushToken response",
        expect.objectContaining({
          response: { tokenCount: 2 },
        }),
      );
    });

    it("handles channel data with no tokens field", async () => {
      jest.spyOn(provider.users, "getChannelData").mockResolvedValue({
        data: {},
      } as GetChannelDataResponse);
      const setChannelDataSpy = jest.spyOn(provider.users, "setChannelData").mockResolvedValue({
        data: { tokens: [mockToken] },
      } as SetChannelDataResponse);

      const result = await client.appendPushToken({
        channelId: mockChannelId,
        userId: mockUserId,
        token: mockToken,
      });

      expectToBeSuccess(result);
      expect(setChannelDataSpy).toHaveBeenCalledWith(mockUserId, mockChannelId, {
        data: { tokens: [mockToken] },
      });
    });

    it("logs info when no existing channel data found", async () => {
      jest.spyOn(provider.users, "getChannelData").mockRejectedValue(createNotFoundError());
      jest.spyOn(provider.users, "setChannelData").mockResolvedValue({
        data: { tokens: [mockToken] },
      } as SetChannelDataResponse);

      await client.appendPushToken({
        channelId: mockChannelId,
        userId: mockUserId,
        token: mockToken,
      });

      expect(mockLogger.info).toHaveBeenCalledWith(
        "notifications.appendPushToken no existing channel data",
        expect.objectContaining({
          traceName: "notifications.appendPushToken",
          userId: mockUserId,
          channelId: mockChannelId,
        }),
      );
    });

    it("handles getChannelData error that is not 404", async () => {
      const mockError = new Error("API error");
      jest.spyOn(provider.users, "getChannelData").mockRejectedValue(mockError);
      const setChannelDataSpy = jest.spyOn(provider.users, "setChannelData");

      const result = await client.appendPushToken({
        channelId: mockChannelId,
        userId: mockUserId,
        token: mockToken,
      });

      expectToBeFailure(result);
      expect(result.error).toEqual(
        new ServiceError({ issues: [{ code: "unknown", message: "API error" }] }),
      );

      expect(setChannelDataSpy).not.toHaveBeenCalled();
      expect(mockLogger.error).toHaveBeenCalledWith(
        "notifications.appendPushToken [unknown] API error",
        expect.any(Object),
      );
    });

    it("handles setChannelData error", async () => {
      const mockError = new Error("Set channel data failed");
      jest.spyOn(provider.users, "getChannelData").mockRejectedValue(createNotFoundError());
      jest.spyOn(provider.users, "setChannelData").mockRejectedValue(mockError);

      const result = await client.appendPushToken({
        channelId: mockChannelId,
        userId: mockUserId,
        token: mockToken,
      });

      expectToBeFailure(result);
      expect(result.error).toEqual(
        new ServiceError({ issues: [{ code: "unknown", message: "Set channel data failed" }] }),
      );

      expect(mockLogger.error).toHaveBeenCalledWith(
        "notifications.appendPushToken [unknown] Set channel data failed",
        expect.any(Object),
      );
    });

    it("does not log sensitive push token in request or response", async () => {
      jest.spyOn(provider.users, "getChannelData").mockRejectedValue(createNotFoundError());
      jest.spyOn(provider.users, "setChannelData").mockResolvedValue({
        data: { tokens: [mockToken] },
      } as SetChannelDataResponse);

      await client.appendPushToken({
        channelId: mockChannelId,
        userId: mockUserId,
        token: mockToken,
      });

      // Check that no log call contains the actual token
      const allLogCalls = [
        ...mockLogger.info.mock.calls,
        ...mockLogger.warn.mock.calls,
        ...mockLogger.error.mock.calls,
      ];

      allLogCalls.forEach((call) => {
        expect(JSON.stringify(call)).not.toContain(mockToken);
      });
    });

    it("handles response with no tokens field", async () => {
      jest.spyOn(provider.users, "getChannelData").mockRejectedValue(createNotFoundError());
      jest.spyOn(provider.users, "setChannelData").mockResolvedValue({
        data: {},
      } as SetChannelDataResponse);

      const result = await client.appendPushToken({
        channelId: mockChannelId,
        userId: mockUserId,
        token: mockToken,
      });

      expectToBeSuccess(result);
      expect(result.value.success).toBe(true);
    });
  });

  describe("upsertWorkplace", () => {
    const mockWorkplaceId = "workplace-123";
    const mockWorkplaceName = "Test Workplace";

    it("handles Knock API error", async () => {
      const mockError = new Error("Tenant API error");
      jest.spyOn(provider.tenants, "set").mockRejectedValue(mockError);

      const input: UpsertWorkplaceRequest = {
        workplaceId: mockWorkplaceId,
        name: mockWorkplaceName,
      };

      const result = await client.upsertWorkplace(input);

      expectToBeFailure(result);
      expect(result.error).toEqual(
        new ServiceError({ issues: [{ code: "unknown", message: mockError.message }] }),
      );

      expect(mockLogger.error).toHaveBeenCalledWith(
        "notifications.upsertWorkplace [unknown] Tenant API error",
        expect.objectContaining({
          traceName: "notifications.upsertWorkplace",
          workplaceId: mockWorkplaceId,
          name: mockWorkplaceName,
        }),
      );
    });

    it("upserts workplace with all optional fields", async () => {
      const mockCreatedAt = new Date("2023-01-01");
      const mockEmail = "test@example.com";
      const mockPhoneNumber = "+1234567890";
      const mockTimeZone = "America/New_York";

      const mockResponse = {
        id: mockWorkplaceId,
        name: mockWorkplaceName,
        __typename: "Tenant",
      };
      const tenantSetSpy = jest.spyOn(provider.tenants, "set").mockResolvedValue(mockResponse);

      const input: UpsertWorkplaceRequest = {
        workplaceId: mockWorkplaceId,
        name: mockWorkplaceName,
        createdAt: mockCreatedAt,
        email: mockEmail,
        phoneNumber: mockPhoneNumber,
        timeZone: mockTimeZone,
      };

      const result = await client.upsertWorkplace(input);

      expectToBeSuccess(result);
      expect(result.value.workplaceId).toBe(mockWorkplaceId);

      expect(tenantSetSpy).toHaveBeenCalledWith(mockWorkplaceId, {
        name: mockWorkplaceName,
        created_at: mockCreatedAt.toISOString(),
        email: mockEmail,
        phone_number: "+1234567890",
        timezone: mockTimeZone,
      });
    });

    it("upserts workplace with only required field", async () => {
      const mockResponse = {
        id: mockWorkplaceId,
        name: mockWorkplaceName,
        __typename: "Tenant",
      };
      const tenantSetSpy = jest.spyOn(provider.tenants, "set").mockResolvedValue(mockResponse);

      const input: UpsertWorkplaceRequest = {
        workplaceId: mockWorkplaceId,
      };

      const result = await client.upsertWorkplace(input);

      expectToBeSuccess(result);
      expect(result.value.workplaceId).toBe(mockWorkplaceId);

      expect(tenantSetSpy).toHaveBeenCalledWith(mockWorkplaceId, {});
    });
  });

  describe("signUserToken", () => {
    const mockUserId = "user-123";
    const mockSigningKey = `-----BEGIN PRIVATE KEY-----
MIIEvwIBADANBgkqhkiG9w0BAQEFAASCBKkwggSlAgEAAoIBAQDev+3qU8gkOngO
UH/7odRQ974Uobz16UTQ2eW15elMzBys+wQ43yoQUVTFzFrf3oCzXy1L0BoH+GUp
OHaPsQFL9hc18VlphWCg3D4OUVLPhqeYiRcK1kh+955HJWWlS6imM1Ds1OgXuJOg
ywJVnLOj6DLnuRRwjw3FO7P5+ywZuU6UzfWsSiHkcCUgMcjyVDaeStwzw8aZUhjS
vhoUnPgPlPwkXun9WrsWDvYzToCgpKThHo5xvCtS2TSciO+oXQjbtho78FbaoRZt
T8FfqmsEsmFoPwD/lrjHtpCtK4Qpu8WrAWyGYbQy+iF6aX+WJa9DAMpNEYUzKPaL
STb77jOJAgMBAAECggEARhSmesHvRw6qNP64tWd90BeR0xXryIaiov7bGbaDByl0
oCu9cVMs/cNI445ezO5JGaYJL0AC4J0S3rwn+R9cZBTByrPrSJqxAwsn7wNBBY+8
7O28tSkj1+Z6ArJOX4oFPn0Iqep2NvhYYg9c5aiOkDP+yA7f0mX/lB0ri6utfU3M
kE1a9O6sHCTrE1+Z2fnpIj8Ip2Wrv9cp/reXbfnpRMNhrRwAYPnV6w0igwNpwElH
7C08cj4ftqBWEwravHl62faAP64VIURqsW4irAqsadkkWqF8h3fQqbe7vivptY6y
u1eL817cnG3rclegKJVNSgVYc83YBZ4ALvuRJjJW7QKBgQD0pMvy0H7aviiAWhBl
W+zcYdhvAk6NxlZtK6ii2hr7k/5eWY8RLbM3TvLK/pNzUg1j4kOCvpLUH3UJU6kq
5pQc82vHR01CDdhDfl2EvdtUfknFmuXdZk5oSVaRUQy+2QnOYNqDXDtHEgsIVqQ5
2s5ax+qiSqS9IK/oJDiEJ7SSGwKBgQDpFvT/CxpELApYLXumCrFDEQCTVDfJf5NE
xwKEe0OU7VupOJVZr84qj0nKI0/08Er+bdmvRWyVtGPf9CZniRq2WlMP5V+9nMDt
lFad5Qxanm0ZwApfJSqQkIv0tVTeGoUw9dIlG9ym+E2Yi/ZoW0/oL9CCtF0QvFg7
RfSf/B+LKwKBgQDQfoYmGRSTfc5snNUuXOp/Y5AeA1xJLYhIoBWnPLQURitZ43+v
R0BeWZVH9TBa7snkn1ej3KCr0WdgHIGmwz3lcnsfKaApND1kQBSZZWjAGKTsmLdg
OamG7UGutOFk4PmffiGcJAWM606lu5lYiSambYyE5ZKCcJIaCIx17JTSkwKBgQCW
/vcxLSkT1o/Q9Y3vT2frsVz1FA6bqthlKqKX3h42oNjLM8uUcQ4WhgJgPyXx36RF
VDY7k7a2+Efm8YvbcHbsgHDkkEvIUn6sqXa/DH1HSvAUSVKuti3vvqPbn4hd5UI5
KFW9EmKLi7kAxFKY4eZO3IKv2VWcnNZvd270IOjyRwKBgQDGl3CHxY/nsYWBjYcX
ECNjX+XyepFFUianHuIbHyShCOhxTjUPSfrc0YnCWEl4WJ5aQHTocSulDJ7SAmON
8SYmBZBUg9IiqD0jp8CaaI5Gy3n/DwwoCnLZTKxJ0kEVJWtVmn9m6Zr4wd2VZsru
fQ4QecZi2079UtRo1Amb8+wqaQ==
-----END PRIVATE KEY-----`;

    it("signs user token successfully with default expiration", async () => {
      const clientWithSigningKey = new NotificationClient({
        logger: mockLogger,
        provider,
        signingKey: mockSigningKey,
        tracer: mockTracer,
      });

      const input: SignUserTokenRequest = {
        userId: mockUserId,
      };

      const result = await clientWithSigningKey.signUserToken(input);

      expectToBeSuccess(result);
      expect(result.value.token).toBeDefined();
      expect(typeof result.value.token).toBe("string");

      expect(mockLogger.info).toHaveBeenCalledWith(
        "notifications.signUserToken request",
        expect.objectContaining({
          traceName: "notifications.signUserToken",
          destination: "knock.signUserToken",
          userId: mockUserId,
          expiresInSeconds: 3600,
        }),
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        "notifications.signUserToken response",
        expect.objectContaining({
          traceName: "notifications.signUserToken",
          destination: "knock.signUserToken",
          userId: mockUserId,
          expiresInSeconds: 3600,
        }),
      );
    });

    it("signs user token successfully with custom expiration", async () => {
      const clientWithSigningKey = new NotificationClient({
        logger: mockLogger,
        provider,
        signingKey: mockSigningKey,
        tracer: mockTracer,
      });

      const customExpiration = 7200;
      const input: SignUserTokenRequest = {
        userId: mockUserId,
        expiresInSeconds: customExpiration,
      };

      const result = await clientWithSigningKey.signUserToken(input);

      expectToBeSuccess(result);
      expect(result.value.token).toBeDefined();
      expect(typeof result.value.token).toBe("string");

      expect(mockLogger.info).toHaveBeenCalledWith(
        "notifications.signUserToken request",
        expect.objectContaining({
          userId: mockUserId,
          expiresInSeconds: customExpiration,
        }),
      );
    });

    it("returns failure when signing key is missing", async () => {
      const clientWithoutSigningKey = new NotificationClient({
        logger: mockLogger,
        provider,
        tracer: mockTracer,
      });

      const input: SignUserTokenRequest = {
        userId: mockUserId,
      };

      const result = await clientWithoutSigningKey.signUserToken(input);

      expectToBeFailure(result);
      expect(result.error).toEqual(
        new ServiceError({
          issues: [{ code: "missingSigningKey", message: "Missing signing key." }],
        }),
      );
    });

    it("handles signUserToken API error", async () => {
      const invalidSigningKey = "invalid-key";
      const clientWithInvalidSigningKey = new NotificationClient({
        logger: mockLogger,
        provider,
        signingKey: invalidSigningKey,
        tracer: mockTracer,
      });

      const input: SignUserTokenRequest = {
        userId: mockUserId,
      };

      const result = await clientWithInvalidSigningKey.signUserToken(input);

      expectToBeFailure(result);
      expect(result.error).toBeInstanceOf(ServiceError);
      expect(result.error.issues[0]!.code).toBe("unknown");

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringMatching(/^notifications\.signUserToken \[unknown]/),
        expect.objectContaining({
          traceName: "notifications.signUserToken",
          destination: "knock.signUserToken",
          userId: mockUserId,
          expiresInSeconds: 3600,
        }),
      );
    });

    it("does not log sensitive token in response", async () => {
      const clientWithSigningKey = new NotificationClient({
        logger: mockLogger,
        provider,
        signingKey: mockSigningKey,
        tracer: mockTracer,
      });

      const input: SignUserTokenRequest = {
        userId: mockUserId,
      };

      const result = await clientWithSigningKey.signUserToken(input);
      expectToBeSuccess(result);
      const actualToken = result.value.token;

      // Check that no log call contains the actual token
      const allLogCalls = [
        ...mockLogger.info.mock.calls,
        ...mockLogger.warn.mock.calls,
        ...mockLogger.error.mock.calls,
      ];

      allLogCalls.forEach((call) => {
        expect(JSON.stringify(call)).not.toContain(actualToken);
      });
    });

    it("logs request and response correctly", async () => {
      const clientWithSigningKey = new NotificationClient({
        logger: mockLogger,
        provider,
        signingKey: mockSigningKey,
        tracer: mockTracer,
      });

      const customExpiration = 1800;
      const input: SignUserTokenRequest = {
        userId: mockUserId,
        expiresInSeconds: customExpiration,
      };

      await clientWithSigningKey.signUserToken(input);

      expect(mockLogger.info).toHaveBeenCalledWith("notifications.signUserToken request", {
        traceName: "notifications.signUserToken",
        destination: "knock.signUserToken",
        userId: mockUserId,
        expiresInSeconds: customExpiration,
      });

      expect(mockLogger.info).toHaveBeenCalledWith("notifications.signUserToken response", {
        traceName: "notifications.signUserToken",
        destination: "knock.signUserToken",
        userId: mockUserId,
        expiresInSeconds: customExpiration,
      });
    });
  });
});

function createNotFoundError(): Error & { status: number } {
  const error = new Error("Not found") as Error & { status: number };
  error.status = 404;
  return error;
}
