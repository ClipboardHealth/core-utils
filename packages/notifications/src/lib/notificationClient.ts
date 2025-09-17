import {
  failure,
  isFailure,
  type LogFunction,
  type Logger,
  ServiceError,
  type ServiceResult,
  success,
  toError,
} from "@clipboard-health/util-ts";
import { signUserToken } from "@knocklabs/node";

import { createTriggerLogParams } from "./internal/createTriggerLogParams";
import { createTriggerTraceOptions } from "./internal/createTriggerTraceOptions";
import { formatPhoneNumber } from "./internal/formatPhoneNumber";
import { IdempotentKnock } from "./internal/idempotentKnock";
import { redact } from "./internal/redact";
import { toKnockBody } from "./internal/toKnockBody";
import type {
  AppendPushTokenRequest,
  AppendPushTokenResponse,
  LogParams,
  NotificationClientParams,
  SignUserTokenRequest,
  SignUserTokenResponse,
  Span,
  Tracer,
  TriggerBody,
  TriggerRequest,
  TriggerResponse,
  UpsertWorkplaceRequest,
  UpsertWorkplaceResponse,
} from "./types";

const LOG_PARAMS = {
  trigger: {
    traceName: "notifications.trigger",
    destination: "knock.workflows.trigger",
  },
  appendPushToken: {
    traceName: "notifications.appendPushToken",
    destination: "knock.users.setChannelData",
  },
  upsertWorkplace: {
    traceName: "notifications.upsertWorkplace",
    destination: "knock.tenants.set",
  },
  signUserToken: {
    traceName: "notifications.signUserToken",
    destination: "knock.signUserToken",
  },
};

export const MAXIMUM_RECIPIENTS_COUNT = 1000;

export const ERROR_CODES = {
  expired: "expired",
  recipientCountAboveMaximum: "recipientCountAboveMaximum",
  recipientCountBelowMinimum: "recipientCountBelowMinimum",
  missingSigningKey: "missingSigningKey",
  unknown: "unknown",
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

interface NotificationError {
  code: ErrorCode;
  message: string;
}

/**
 * Client for sending notifications through third-party providers.
 */
export class NotificationClient {
  private readonly logger: Logger;
  private readonly provider: IdempotentKnock;
  private readonly signingKey: string | undefined;
  private readonly tracer: Tracer;

  /**
   * Creates a new NotificationClient instance.
   */
  constructor(params: NotificationClientParams) {
    const { logger, signingKey, tracer } = params;

    this.logger = logger;
    this.tracer = tracer;
    this.signingKey = signingKey;
    this.provider =
      "provider" in params
        ? // eslint-disable-next-line unicorn/consistent-destructuring
          params.provider
        : // eslint-disable-next-line unicorn/consistent-destructuring
          new IdempotentKnock({ apiKey: params.apiKey, logger });
  }

  /**
   * Triggers a notification through third-party providers.
   *
   * This method handles:
   * - Stale notifications prevention through expiration checks.
   * - Logging with sensitive data redaction.
   * - Distributed tracing with notification metadata.
   * - Idempotency to prevent duplicate notifications.
   * - Comprehensive error handling and logging.
   *
   * @returns Promise resolving to either an error or successful response.
   *
   * @example
   * <embedex source="packages/notifications/examples/notificationClient.ts">
   *
   * ```ts
   * import { NotificationClient, type Span } from "@clipboard-health/notifications";
   * import { isSuccess } from "@clipboard-health/util-ts";
   *
   * const client = new NotificationClient({
   *   apiKey: "test-api-key",
   *   logger: {
   *     info: console.log,
   *     warn: console.warn,
   *     error: console.error,
   *   } as const,
   *   tracer: {
   *     trace: <T>(_name: string, _options: unknown, fun: (span?: Span | undefined) => T): T => fun(),
   *   },
   * });
   *
   * async function triggerNotification(job: { attemptsCount: number }) {
   *   const result = await client.trigger({
   *     attempt: (job?.attemptsCount ?? 0) + 1,
   *     body: {
   *       recipients: ["user-1"],
   *       data: { favoriteColor: "blue", secret: "2" },
   *     },
   *     expiresAt: new Date(Date.now() + 300_000), // 5 minutes
   *     idempotencyKey: "welcome-user-4",
   *     key: "welcome-email",
   *     keysToRedact: ["secret"],
   *   });
   *
   *   if (isSuccess(result)) {
   *     console.log("Notification sent:", result.value.id);
   *   }
   * }
   *
   * // eslint-disable-next-line unicorn/prefer-top-level-await
   * void triggerNotification({ attemptsCount: 0 });
   * ```
   *
   * </embedex>
   */
  public async trigger(params: TriggerRequest): Promise<ServiceResult<TriggerResponse>> {
    const logParams = createTriggerLogParams({ ...params, ...LOG_PARAMS.trigger });
    return await this.tracer.trace(
      logParams.traceName,
      createTriggerTraceOptions(logParams),
      async (span) => {
        const validated = this.validateTriggerRequest({ ...params, span, logParams });
        if (isFailure(validated)) {
          return validated;
        }

        try {
          const { key, body, idempotencyKey, keysToRedact = [] } = validated.value;
          this.logTriggerRequest({ logParams, body, keysToRedact });

          const response = await this.provider.workflows.trigger(key, toKnockBody(body), {
            idempotencyKey,
          });

          const id = response.workflow_run_id;
          this.logTriggerResponse({ span, response, id, logParams });

          return success({ id });
        } catch (maybeError) {
          const error = toError(maybeError);
          return this.createAndLogError({
            notificationError: {
              code: ERROR_CODES.unknown,
              message: error.message,
            },
            span,
            logFunction: this.logger.error,
            logParams,
            metadata: { error },
          });
        }
      },
    );
  }

  /**
   * Append to a user's push tokens.
   *
   * @returns Promise resolving to either an error or successful response.
   */
  public async appendPushToken(
    params: AppendPushTokenRequest,
  ): Promise<ServiceResult<AppendPushTokenResponse>> {
    const { channelId, userId, token } = params;
    const logParams = { ...LOG_PARAMS.appendPushToken, userId, channelId };

    try {
      // Don't log the push token, it is sensitive.
      this.logger.info(`${logParams.traceName} request`, logParams);
      const existingTokens = await this.getExistingTokens({ userId, channelId, logParams });
      this.logger.info(`${logParams.traceName} existing tokens`, {
        ...logParams,
        existingTokenCount: existingTokens.length,
      });

      const response = await this.provider.users.setChannelData(userId, channelId, {
        data: { tokens: [...new Set([...existingTokens, token])] },
      });

      this.logger.info(`${logParams.traceName} response`, {
        ...logParams,
        // Don't log the actual response; push tokens are sensitive.
        response: { tokenCount: "tokens" in response.data ? response.data.tokens.length : 0 },
      });

      return success({ success: true });
    } catch (maybeError) {
      const error = toError(maybeError);
      return this.createAndLogError({
        notificationError: {
          code: ERROR_CODES.unknown,
          message: error.message,
        },
        logFunction: this.logger.error,
        logParams,
        metadata: { error },
      });
    }
  }

  /**
   * Sign a user token for enhanced security.
   *
   * @see {@link https://docs.knock.app/in-app-ui/security-and-authentication#authentication-with-enhanced-security}
   *
   * @returns Promise resolving to either an error or successful response.
   */
  public async signUserToken(
    params: SignUserTokenRequest,
  ): Promise<ServiceResult<SignUserTokenResponse>> {
    const { userId, expiresInSeconds = 3600 } = params;

    const logParams = { ...LOG_PARAMS.signUserToken, userId, expiresInSeconds };

    if (!this.signingKey) {
      return this.createAndLogError({
        notificationError: {
          code: ERROR_CODES.missingSigningKey,
          message: "Missing signing key.",
        },
        logParams,
      });
    }

    try {
      this.logger.info(`${logParams.traceName} request`, logParams);

      const response = await signUserToken(userId, {
        signingKey: this.signingKey,
        expiresInSeconds,
      });

      // Don't log the actual response; user tokens are sensitive.
      this.logger.info(`${logParams.traceName} response`, logParams);

      return success({ token: response });
    } catch (maybeError) {
      const error = toError(maybeError);
      return this.createAndLogError({
        notificationError: {
          code: ERROR_CODES.unknown,
          message: error.message,
        },
        logFunction: this.logger.error,
        logParams,
        metadata: { error },
      });
    }
  }

  /**
   * Updates or creates a workplace (tenant) in Knock.
   *
   * @returns Promise resolving to either an error or successful response.
   */
  public async upsertWorkplace(
    params: UpsertWorkplaceRequest,
  ): Promise<ServiceResult<UpsertWorkplaceResponse>> {
    const { workplaceId, ...body } = params;
    const logParams = { ...LOG_PARAMS.upsertWorkplace, workplaceId, ...body };

    try {
      this.logger.info(`${logParams.traceName} request`, logParams);

      body.phoneNumber &&= formatPhoneNumber({ phoneNumber: body.phoneNumber });

      const response = await this.provider.tenants.set(workplaceId, body);

      this.logger.info(`${logParams.traceName} response`, {
        ...logParams,
        response: { workplaceId: response.id, name: response.name },
      });

      return success({
        workplaceId: response.id,
      });
    } catch (maybeError) {
      const error = toError(maybeError);
      return this.createAndLogError({
        notificationError: {
          code: ERROR_CODES.unknown,
          message: error.message,
        },
        logFunction: this.logger.error,
        logParams,
        metadata: { error },
      });
    }
  }

  private validateTriggerRequest(
    params: TriggerRequest & { span: Span | undefined; logParams: LogParams },
  ): ServiceResult<TriggerRequest> {
    const { body, expiresAt, span, logParams } = params;

    if (body.recipients.length <= 0) {
      return this.createAndLogError({
        notificationError: {
          code: ERROR_CODES.recipientCountBelowMinimum,
          message: `Got ${body.recipients.length} recipients; must be > 0.`,
        },
        span,
        logParams,
      });
    }

    if (body.recipients.length > MAXIMUM_RECIPIENTS_COUNT) {
      const recipientsCount = body.recipients.length;
      return this.createAndLogError({
        notificationError: {
          code: ERROR_CODES.recipientCountAboveMaximum,
          message: `Got ${recipientsCount} recipients; must be <= ${MAXIMUM_RECIPIENTS_COUNT}.`,
        },
        span,
        logParams,
        metadata: { recipientsCount },
      });
    }

    const now = new Date();
    if (now > expiresAt) {
      return this.createAndLogError({
        notificationError: {
          code: ERROR_CODES.expired,
          message: `Got ${now.toISOString()}; notification expires at ${expiresAt.toISOString()}.`,
        },
        span,
        logParams,
        metadata: { currentTime: now.toISOString(), expiresAt: expiresAt.toISOString() },
      });
    }

    return success(params);
  }

  private async getExistingTokens(params: {
    userId: string;
    channelId: string;
    logParams: LogParams;
  }): Promise<string[]> {
    const { userId, channelId, logParams } = params;

    // If existing tokens, use them; otherwise, start with empty array
    try {
      const response = await this.provider.users.getChannelData(userId, channelId);
      return "tokens" in response.data ? response.data.tokens : [];
    } catch (maybeError) {
      const error = toError(maybeError);
      if ("status" in error && error.status === 404) {
        this.logger.info(`${logParams.traceName} no existing channel data`, logParams);
        return [];
      }

      throw error;
    }
  }

  private logTriggerRequest(params: {
    logParams: LogParams;
    body: TriggerBody;
    keysToRedact: string[];
  }): void {
    const { logParams, body, keysToRedact } = params;

    this.logger.info(`${logParams.traceName} request`, {
      ...logParams,
      redactedBody: {
        ...body,
        // Don't log potentially sensitive recipient data.
        recipients: body.recipients.length,
        data: redact({ data: body.data ?? undefined, keysToRedact }),
      },
    });
  }

  private logTriggerResponse(params: {
    span?: Span | undefined;
    response: unknown;
    id: string;
    logParams: LogParams;
  }): string {
    const { span, response, id, logParams } = params;

    span?.addTags({
      "response.id": id,
      success: true,
    });

    this.logger.info(`${logParams.traceName} response`, { ...logParams, id, response });

    return id;
  }

  private createAndLogError(params: {
    notificationError: NotificationError;
    span?: Span | undefined;
    logFunction?: LogFunction;
    logParams: LogParams;
    metadata?: Record<string, unknown>;
  }): ServiceResult<never> {
    const { logParams, notificationError, span, metadata, logFunction = this.logger.warn } = params;
    const { code, message } = notificationError;

    span?.addTags({
      error: true,
      "error.type": code,
      "error.message": message,
    });

    logFunction(`${logParams.traceName} [${code}] ${message}`, {
      ...logParams,
      ...metadata,
    });

    return failure(new ServiceError({ issues: [{ code, message }] }));
  }
}
