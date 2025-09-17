import { expectToBeFailure, expectToBeSuccess } from "@clipboard-health/testing-core";
import { type Logger, ServiceError } from "@clipboard-health/util-ts";
import { type Knock, signUserToken } from "@knocklabs/node";

import { IdempotentKnock } from "./internal/idempotentKnock";
import { NotificationClient } from "./notificationClient";
import type { SignUserTokenRequest, Tracer, TriggerRequest, UpsertWorkplaceRequest } from "./types";

jest.mock("@knocklabs/node", () => ({
  ...(jest.requireActual("@knocklabs/node") as unknown as Record<string, unknown>),
  signUserToken: jest.fn(),
}));

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

    it("rejects request with too many recipients", async () => {
      const recipients = Array.from({ length: 1001 }, (_, index) => ({ userId: `user-${index}` }));
      const input: TriggerRequest = {
        key: mockWorkflowKey,
        body: { recipients },
        idempotencyKey: mockIdempotencyKey,
        keysToRedact: [],
        expiresAt: mockExpiresAt,
        attempt: mockAttempt,
      };

      const actual = await client.trigger(input);

      expectToBeFailure(actual);
      expect(actual.error.message).toContain("Got 1001 recipients; must be <= 1000");
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

    it("successfully upsert workplace", async () => {
      const mockResponse = {
        id: mockWorkplaceId,
        name: mockWorkplaceName,
        __typename: "Tenant",
      };
      const tenantSetSpy = jest.spyOn(provider.tenants, "set").mockResolvedValue(mockResponse);

      const input: UpsertWorkplaceRequest = {
        workplaceId: mockWorkplaceId,
        name: mockWorkplaceName,
      };

      const result = await client.upsertWorkplace(input);

      expectToBeSuccess(result);
      expect(result.value.workplaceId).toBe(mockWorkplaceId);

      expect(tenantSetSpy).toHaveBeenCalledWith(mockWorkplaceId, {
        name: mockWorkplaceName,
      });
      expect(mockLogger.info).toHaveBeenCalledWith(
        "notifications.upsertWorkplace request",
        expect.objectContaining({
          traceName: "notifications.upsertWorkplace",
          destination: "knock.tenants.set",
          workplaceId: mockWorkplaceId,
          name: mockWorkplaceName,
        }),
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        "notifications.upsertWorkplace response",
        expect.objectContaining({
          response: {
            workplaceId: mockWorkplaceId,
            name: mockWorkplaceName,
          },
        }),
      );
    });

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

    it("logs request and response with correct parameters", async () => {
      const mockResponse = {
        id: mockWorkplaceId,
        name: mockWorkplaceName,
        __typename: "Tenant",
      };
      jest.spyOn(provider.tenants, "set").mockResolvedValue(mockResponse);

      const input: UpsertWorkplaceRequest = {
        workplaceId: mockWorkplaceId,
        name: mockWorkplaceName,
      };

      await client.upsertWorkplace(input);

      expect(mockLogger.info).toHaveBeenCalledWith("notifications.upsertWorkplace request", {
        traceName: "notifications.upsertWorkplace",
        destination: "knock.tenants.set",
        workplaceId: mockWorkplaceId,
        name: mockWorkplaceName,
      });

      expect(mockLogger.info).toHaveBeenCalledWith("notifications.upsertWorkplace response", {
        traceName: "notifications.upsertWorkplace",
        destination: "knock.tenants.set",
        workplaceId: mockWorkplaceId,
        name: mockWorkplaceName,
        response: {
          workplaceId: mockWorkplaceId,
          name: mockWorkplaceName,
        },
      });
    });
  });

  describe("signUserToken", () => {
    const mockUserId = "user-123";
    const mockSigningKey = "test-signing-key";
    const mockToken = "signed-jwt-token";
    const mockSignUserToken = signUserToken as jest.MockedFunction<typeof signUserToken>;

    beforeEach(() => {
      mockSignUserToken.mockClear();
    });

    it("signs user token successfully with default expiration", async () => {
      mockSignUserToken.mockResolvedValue(mockToken);

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
      expect(result.value.token).toBe(mockToken);

      expect(mockSignUserToken).toHaveBeenCalledWith(mockUserId, {
        signingKey: mockSigningKey,
        expiresInSeconds: 3600,
      });
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
      mockSignUserToken.mockResolvedValue(mockToken);

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
      expect(result.value.token).toBe(mockToken);

      expect(mockSignUserToken).toHaveBeenCalledWith(mockUserId, {
        signingKey: mockSigningKey,
        expiresInSeconds: customExpiration,
      });
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

      expect(mockSignUserToken).not.toHaveBeenCalled();
    });

    it("handles signUserToken API error", async () => {
      const mockError = new Error("Sign token API error");
      mockSignUserToken.mockRejectedValue(mockError);

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

      expectToBeFailure(result);
      expect(result.error).toEqual(
        new ServiceError({ issues: [{ code: "unknown", message: "Sign token API error" }] }),
      );

      expect(mockLogger.error).toHaveBeenCalledWith(
        "notifications.signUserToken [unknown] Sign token API error",
        expect.objectContaining({
          traceName: "notifications.signUserToken",
          destination: "knock.signUserToken",
          userId: mockUserId,
          expiresInSeconds: 3600,
        }),
      );
    });

    it("does not log sensitive token in response", async () => {
      mockSignUserToken.mockResolvedValue(mockToken);

      const clientWithSigningKey = new NotificationClient({
        logger: mockLogger,
        provider,
        signingKey: mockSigningKey,
        tracer: mockTracer,
      });

      const input: SignUserTokenRequest = {
        userId: mockUserId,
      };

      await clientWithSigningKey.signUserToken(input);

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

    it("logs request and response correctly", async () => {
      mockSignUserToken.mockResolvedValue(mockToken);

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
