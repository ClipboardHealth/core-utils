export type Tags = Record<string, unknown>;

export const MOBILE_PLATFORMS = ["android", "ios"] as const;

export type MobilePlatform = (typeof MOBILE_PLATFORMS)[number];

export interface TraceOptions {
  resource?: string;
  tags?: Tags;
}

export interface LogParams {
  traceName: string;
  destination: string;
}

export interface Span {
  addTags: (tags: Tags) => void;
}

/**
 * Tracer interface for distributed tracing operations.
 */
export interface Tracer {
  trace<T>(name: string, options: TraceOptions, fun: (span?: Span) => T): T;
}

export interface PushChannelData {
  /**
   * A list of push channel tokens.
   */
  tokens: string[];
}

export type InlineChannelDataRequest = Record<string, PushChannelData>;

/**
 * Parameters to upsert and inline-identify a user, ensuring they exist before notifying them.
 */
export interface InlineIdentifyUserRequest {
  /**
   * The user ID.
   */
  userId: string;

  /**
   * The user's channel data.
   */
  channelData?: InlineChannelDataRequest;

  /**
   * The user's creation date.
   */
  createdAt?: Date | undefined;

  /**
   * The user's email address.
   */
  email?: string | undefined;

  /**
   * The user's display name.
   */
  name?: string | undefined;

  /**
   * The user's phone number.
   */
  phoneNumber?: string | undefined;

  /**
   * The user's [timezone](https://en.wikipedia.org/wiki/List_of_tz_database_time_zones) for
   * scheduled notifications.
   */
  timeZone?: string | undefined;
}

/**
 * Specifies a recipient in a request. This can either be a user ID or an inline user request.
 */
export type RecipientRequest = string | InlineIdentifyUserRequest;

export interface TriggerBody {
  /**
   * The recipients to trigger the workflow for. Limited to 1,000 recipients.
   */
  recipients: RecipientRequest[];

  /**
   * The trigger actor.
   */
  actor?: RecipientRequest;

  /**
   * An optional key used to reference a specific trigger request when issuing a cancellation
   * request. You must provide it while triggering in order to enable subsequent cancellation and it
   * should be unique across trigger requests to avoid unintentional cancellations.
   */
  cancellationKey?: string;

  /**
   * An optional map of data to pass into the trigger execution. Limited to 1024 bytes for each
   * string and 10MB overall.
   */
  data?: Record<string, unknown>;

  /**
   * The associated workplace ID.
   */
  workplaceId?: string;
}

/**
 * Request parameters for triggering a notification.
 */
export interface TriggerRequest {
  /** Notification key. */
  key: string;

  /** Notification payload. */
  body: TriggerBody;

  /**
   * Key to prevent duplicate requests if provider supports it. It's important it is deterministic
   * and remains the same across any retry logic.
   */
  idempotencyKey: string;

  /** Array of data keys to redact in logs for privacy. */
  keysToRedact?: string[];

  /** Expiration timestamp after which the request is dropped. */
  expiresAt: Date;

  /** Attempt number for tracking. */
  attempt: number;
}

/**
 * Response from triggering a notification.
 */
export interface TriggerResponse {
  /** Third-party provider's unique identifier. */
  id: string;
}

/**
 * Request parameters for appending a push token.
 */
export interface AppendPushTokenRequest {
  /** The channel ID. */
  channelId: string;

  /** The user ID. */
  userId: string;

  /** The push token to append. */
  token: string;
}

/**
 * Response from appending a push token.
 */
export interface AppendPushTokenResponse {
  /** Whether the push token was appended successfully. */
  success: boolean;
}

/**
 * Request parameters for workplace upsert.
 */
export interface UpsertWorkplaceRequest {
  /**
   * The workplace's unique identifier.
   */
  workplaceId: string;

  /**
   * The workplace's creation date.
   */
  createdAt?: Date | undefined;

  /**
   * The workplace's email address.
   */
  email?: string | undefined;

  /**
   * The workplace's display name.
   */
  name?: string | undefined;

  /**
   * The workplace's phone number.
   */
  phoneNumber?: string | undefined;

  /**
   * The workplace's [timezone](https://en.wikipedia.org/wiki/List_of_tz_database_time_zones) for
   * scheduled notifications.
   */
  timeZone?: string | undefined;
}

/**
 * Response after workplace upsert.
 */
export interface UpsertWorkplaceResponse {
  /**
   * The workplace's unique identifier.
   */
  workplaceId: string;
}
