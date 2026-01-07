import {
  failure,
  isFailure,
  type LogFunction,
  ServiceError,
  type ServiceResult,
  success,
  toError,
} from "@clipboard-health/util-ts";
import { signUserToken } from "@knocklabs/node";

import { chunkRecipients, MAXIMUM_RECIPIENTS_COUNT } from "./internal/chunkRecipients";
import { createTriggerLogParams } from "./internal/createTriggerLogParams";
import { createTriggerTraceOptions } from "./internal/createTriggerTraceOptions";
import { IdempotentKnock } from "./internal/idempotentKnock";
import { parseTriggerIdempotencyKey } from "./internal/parseTriggerIdempotencyKey";
import { redact } from "./internal/redact";
import { toKnockUserPreferences } from "./internal/toKnockUserPreferences";
import { toTenantSetRequest } from "./internal/toTenantSetRequest";
import { toTriggerBody } from "./internal/toTriggerBody";
import { triggerIdempotencyKeyParamsToHash } from "./internal/triggerIdempotencyKeyParamsToHash";
import { type TriggerIdempotencyKeyParams } from "./triggerIdempotencyKey";
import {
  type AppendPushTokenRequest,
  type AppendPushTokenResponse,
  type LogParams,
  type NotificationClientParams,
  type SignUserTokenRequest,
  type SignUserTokenResponse,
  type Span,
  type TriggerBody,
  type TriggerChunkedRequest,
  type TriggerChunkedResponse,
  type TriggerRequest,
  type TriggerResponse,
  type UpsertUserPreferencesRequest,
  type UpsertUserPreferencesResponse,
  type UpsertWorkplaceRequest,
  type UpsertWorkplaceResponse,
} from "./types";

const LOG_PARAMS = {
  trigger: {
    traceName: "notifications.trigger",
    destination: "knock.workflows.trigger",
  },
  triggerChunked: {
    traceName: "notifications.triggerChunked",
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
  upsertUserPreferences: {
    traceName: "notifications.upsertUserPreferences",
    destination: "knock.users.setPreferences",
  },
};
export const ERROR_CODES = {
  expired: "expired",
  invalidExpiresAt: "invalidExpiresAt",
  invalidIdempotencyKey: "invalidIdempotencyKey",
  recipientCountBelowMinimum: "recipientCountBelowMinimum",
  recipientCountAboveMaximum: "recipientCountAboveMaximum",
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
  protected readonly logger: NotificationClientParams["logger"];
  protected readonly provider: Required<NotificationClientParams>["provider"];
  protected readonly tracer: NotificationClientParams["tracer"];
  private readonly signingKey: NotificationClientParams["signingKey"];

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
        ? params.provider
        : new IdempotentKnock({ apiKey: params.apiKey, logger });
  }

  /**
   * Triggers a notification through third-party providers.
   *
   * This method handles:
   * - Stale notifications prevention through expiresAt.
   * - Logging with sensitive data redaction.
   * - Distributed tracing with notification metadata.
   * - Idempotency to prevent duplicate notifications.
   * - Comprehensive error handling and logging.
   *
   * @returns Promise resolving to either an error or successful response.
   *
   * @deprecated Use {@link triggerChunked} instead; see the README for details.
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
          const { body, idempotencyKeyParams, keysToRedact = [], workflowKey } = validated.value;
          const { workplaceId } = body;
          const triggerBody = toTriggerBody(body);
          this.logTriggerRequest({ logParams, body, keysToRedact });

          if (params.dryRun) {
            this.logTriggerResponse({ span, response: { dryRun: true }, id: "dry-run", logParams });
            return success({ id: "dry-run" });
          }

          const response = await this.provider.workflows.trigger(workflowKey, triggerBody, {
            idempotencyKey: triggerIdempotencyKeyParamsToHash({
              ...idempotencyKeyParams,
              workplaceId,
            }),
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
   * Triggers a notification with automatic chunking for large recipient lists.
   *
   * This method handles:
   * - Automatic chunking of recipients into groups of MAXIMUM_RECIPIENTS_COUNT.
   * - Idempotency using `${idempotencyKey}-${chunkNumber}` for each chunk.
   * - Stale notifications prevention through expiresAt.
   * - Logging with sensitive data redaction.
   * - Distributed tracing with notification metadata.
   *
   * Use this method from background jobs where you want to:
   * - Store the full serializable request at enqueue time (no stale data issues).
   * - Use the background job ID as the idempotency key base.
   * - Not worry about recipient count limits.
   *
   * @example
   * <embedex source="packages/notifications/examples/triggerNotification.job.ts">
   *
   * ```ts
   * // triggerNotification.job.ts
   * import { type BaseHandler } from "@clipboard-health/background-jobs-adapter";
   * import {
   *   type SerializableTriggerChunkedRequest,
   *   toTriggerChunkedRequest,
   * } from "@clipboard-health/notifications";
   * import { isFailure } from "@clipboard-health/util-ts";
   *
   * import { type NotificationsService } from "./notifications.service";
   * import { CBHLogger } from "./setup";
   * import { TRIGGER_NOTIFICATION_JOB_NAME } from "./triggerNotification.constants";
   *
   * /**
   *  * For @clipboard-health/mongo-jobs:
   *  * 1. Implement `HandlerInterface<SerializableTriggerChunkedRequest>`.
   *  * 2. The 10 default `maxAttempts` with exponential backoff of `2^attemptsCount` means ~17 minutes
   *  *    of cumulative delay. If your notification could be stale before this, set
   *  *    `SerializableTriggerChunkedRequest.expiresAt` when enqueueing.
   *  *
   *  * For @clipboard-health/background-jobs-postgres:
   *  * 1. Implement `Handler<SerializableTriggerChunkedRequest>`.
   *  * 2. The 20 default `maxRetryAttempts` with exponential backoff of `10s * 2^(attempt - 1)` means
   *  *    ~121 days of cumulative delay. If your notification could be stale before this, set
   *  *    `maxRetryAttempts` (and `SerializableTriggerChunkedRequest.expiresAt`) when enqueueing.
   *  *\/
   * export class TriggerNotificationJob implements BaseHandler<SerializableTriggerChunkedRequest> {
   *   public name = TRIGGER_NOTIFICATION_JOB_NAME;
   *   private readonly logger = new CBHLogger({
   *     defaultMeta: {
   *       logContext: TRIGGER_NOTIFICATION_JOB_NAME,
   *     },
   *   });
   *
   *   public constructor(private readonly service: NotificationsService) {}
   *
   *   public async perform(
   *     data: SerializableTriggerChunkedRequest,
   *     /**
   *      * For mongo-jobs, implement `BackgroundJobType<SerializableTriggerChunkedRequest>`, which has
   *      *    `_id`, `attemptsCount`, and `uniqueKey`.
   *      *
   *      * For background-jobs-postgres, implement `Job<SerializableTriggerChunkedRequest>`, which has
   *      *    `id`, `retryAttempts`, and `idempotencyKey`.
   *      *\/
   *     job: { _id: string; attemptsCount: number; uniqueKey?: string },
   *   ) {
   *     const metadata = {
   *       // For background-jobs-postgres, this is called `retryAttempts`.
   *       attempt: job.attemptsCount + 1,
   *       jobId: job._id,
   *       recipientCount: data.body.recipients.length,
   *       workflowKey: data.workflowKey,
   *     };
   *     this.logger.info("TriggerNotificationJob processing", metadata);
   *
   *     try {
   *       const request = toTriggerChunkedRequest(data, {
   *         attempt: metadata.attempt,
   *         idempotencyKey: job.uniqueKey ?? metadata.jobId,
   *       });
   *       const result = await this.service.triggerChunked(request);
   *
   *       if (isFailure(result)) {
   *         throw result.error;
   *       }
   *
   *       const success = "TriggerNotificationJob success";
   *       this.logger.info(success, { ...metadata, response: result.value });
   *       // For background-jobs-postgres, return the `success` string result.
   *     } catch (error) {
   *       this.logger.error("TriggerNotificationJob failure", { ...metadata, error });
   *       throw error;
   *     }
   *   }
   * }
   * ```
   *
   * </embedex>
   *
   * @returns Promise resolving to either an error or successful response with all chunk results.
   */
  public async triggerChunked(
    params: TriggerChunkedRequest,
  ): Promise<ServiceResult<TriggerChunkedResponse>> {
    const logParams = createTriggerLogParams({ ...params, ...LOG_PARAMS.triggerChunked });
    return await this.tracer.trace(
      logParams.traceName,
      createTriggerTraceOptions(logParams),
      async (span) => {
        const { body, expiresAt, idempotencyKey, keysToRedact = [], workflowKey } = params;
        const { workplaceId } = body;

        const validated = this.validateTriggerChunkedRequest({
          body,
          expiresAt,
          span,
          logParams,
        });
        if (isFailure(validated)) {
          return validated;
        }

        this.logTriggerRequest({ logParams, body, keysToRedact });

        if (params.dryRun) {
          this.logTriggerResponse({ span, response: { dryRun: true }, id: "dry-run", logParams });
          return success({ responses: [{ chunkNumber: 1, id: "dry-run" }] });
        }

        const chunks = chunkRecipients({ recipients: body.recipients });
        const responses: Array<{ chunkNumber: number; id: string }> = [];

        // Sequential execution is intentional - we want to fail fast on error and track progress
        for (const recipientChunk of chunks) {
          try {
            const chunkIdempotencyKey = `${idempotencyKey}-${recipientChunk.number}`;
            const chunkBody: TriggerBody = {
              ...body,
              recipients: recipientChunk.recipients,
            };
            const triggerBody = toTriggerBody(chunkBody);

            // eslint-disable-next-line no-await-in-loop
            const response = await this.provider.workflows.trigger(workflowKey, triggerBody, {
              idempotencyKey: chunkIdempotencyKey,
            });

            const id = response.workflow_run_id;
            this.logger.info(`${logParams.traceName} chunk response`, {
              ...logParams,
              chunkNumber: recipientChunk.number,
              totalChunks: chunks.length,
              id,
            });

            responses.push({ chunkNumber: recipientChunk.number, id });
          } catch (maybeError) {
            const error = toError(maybeError);
            return this.createAndLogError({
              notificationError: {
                code: ERROR_CODES.unknown,
                message: `Chunk ${recipientChunk.number}/${chunks.length} failed: ${error.message}`,
              },
              span,
              logFunction: this.logger.error,
              logParams,
              metadata: {
                error,
                chunkNumber: recipientChunk.number,
                totalChunks: chunks.length,
                completedChunks: responses.length,
                expiresAt: expiresAt.toISOString(),
                workplaceId,
              },
            });
          }
        }

        span?.addTags({
          "response.chunks": responses.length,
          success: true,
        });

        this.logger.info(`${logParams.traceName} response`, {
          ...logParams,
          responses,
        });

        return success({ responses });
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
        shouldGenerateJti: true,
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
   * Updates or creates a workplace (tenant) in our provider.
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

      const response = await this.provider.tenants.set(workplaceId, toTenantSetRequest(body));

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

  /**
   * Creates or updates user notification preferences.
   *
   * @returns Promise resolving to either an error or successful response.
   */
  public async upsertUserPreferences(
    params: UpsertUserPreferencesRequest,
  ): Promise<ServiceResult<UpsertUserPreferencesResponse>> {
    const { userId } = params;
    const logParams = { ...LOG_PARAMS.upsertUserPreferences, userId, preferences: params };

    try {
      this.logger.info(`${logParams.traceName} request`, logParams);

      const userPreferences = toKnockUserPreferences(params);
      const response = await this.provider.users.setPreferences(userId, "default", userPreferences);

      this.logger.info(`${logParams.traceName} response`, {
        ...logParams,
        response: { userId, preferenceSet: response },
      });

      return success({ userId });
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

  protected createAndLogError(params: {
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

  private validateTriggerRequest(
    params: TriggerRequest & { span: Span | undefined; logParams: LogParams },
  ): ServiceResult<TriggerRequest & { idempotencyKeyParams: TriggerIdempotencyKeyParams }> {
    const { body, expiresAt, idempotencyKey, span, logParams } = params;

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

    const idempotencyKeyParams = parseTriggerIdempotencyKey({ idempotencyKey });
    if (idempotencyKeyParams === false) {
      return this.createAndLogError({
        notificationError: {
          code: ERROR_CODES.invalidIdempotencyKey,
          message: `Invalid idempotency key: ${idempotencyKey}`,
        },
        span,
        logParams,
      });
    }

    const now = new Date();
    if (expiresAt instanceof Date && now > expiresAt) {
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

    return success({ ...params, idempotencyKeyParams });
  }

  private validateTriggerChunkedRequest(params: {
    body: TriggerBody;
    expiresAt: Date;
    span: Span | undefined;
    logParams: LogParams;
  }): ServiceResult<{ expiresAt: Date }> {
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

    if (Number.isNaN(expiresAt.getTime())) {
      return this.createAndLogError({
        notificationError: {
          code: ERROR_CODES.invalidExpiresAt,
          message: `Invalid expiresAt: ${String(expiresAt)}`,
        },
        span,
        logParams,
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

    return success({ expiresAt });
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
}
