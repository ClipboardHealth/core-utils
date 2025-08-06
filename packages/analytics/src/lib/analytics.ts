import { either as E, type LogFunction, type Logger, toError } from "@clipboard-health/util-ts";
import { Analytics as SegmentAnalytics } from "@segment/analytics-node";

import { formatPhoneAsE164 } from "./formatPhoneAsE164";

export interface UserId {
  userId: string | number;
}

export interface LogContext extends UserId {
  destination: string;
  traceName: string;
}

const LOG_PARAMS = {
  identify: {
    traceName: "analytics.identify",
    destination: "segment.identify",
  },
  track: {
    traceName: "analytics.track",
    destination: "segment.track",
  },
};

export interface CommonTraits {
  createdAt?: Date;
  email?: string;
  name?: string;
  phone?: string;
  type?: string;
}

export type Traits = Record<string, unknown> & Readonly<CommonTraits>;

export interface IdentifyRequest extends UserId {
  traits: Traits;
}

export interface TrackRequest extends UserId {
  event: string;
  traits: Traits;
}

export interface Enabled {
  identify: boolean;
  track: boolean;
}

export class Analytics {
  private readonly enabled: Enabled;
  private readonly logger: Logger;
  private readonly segment: SegmentAnalytics;

  /**
   * Creates a new Analytics instance.
   *
   * @param params.apiKey - API key for the third-party provider.
   * @param params.logger - Logger instance for structured logging.
   * @param params.enabled - Whether or not analytics are enabled.
   */
  constructor(params: { apiKey: string; logger: Logger; enabled: Enabled }) {
    const { apiKey, logger, enabled } = params;

    this.segment = new SegmentAnalytics({ writeKey: apiKey });
    this.logger = logger;
    this.enabled = enabled;
  }

  /**
   * Identifies the user in our third-party analytics provider.
   *
   * @param request.userId ID of the user
   * @param request.traits user traits
   */
  public identify(params: IdentifyRequest): void {
    const { userId, traits } = params;

    const logParams: LogContext = { ...LOG_PARAMS.identify, userId: String(userId) };
    if (!this.enabled.identify) {
      this.log({ logParams, message: "disabled, skipping", metadata: { params } });
      return;
    }

    try {
      this.segment.identify({
        userId: String(userId),
        traits: this.normalizeTraits({ logParams, traits }),
      });
    } catch (error) {
      this.log({
        logParams,
        logFunction: this.logger.error,
        metadata: { error: toError(error) },
      });
    }
  }

  /**
   * Tracks a user event in our third-party analytics provider.
   *
   * @param request.userId ID of the user
   * @param request.event name of the event
   * @param request.traits event properties
   */
  public track(params: TrackRequest): void {
    const { userId, event, traits } = params;

    const logParams: LogContext = { ...LOG_PARAMS.track, userId: String(userId) };
    if (!this.enabled.track) {
      this.log({ logParams, message: "disabled, skipping", metadata: { params } });
      return;
    }

    try {
      this.segment.track({
        userId: String(userId),
        event,
        properties: this.normalizeTraits({ logParams, traits }),
      });
    } catch (error) {
      this.log({
        logParams,
        logFunction: this.logger.error,
        metadata: { error: toError(error) },
      });
    }
  }

  /**
   * Knock and Braze update user data based on Segment Identify events. Knock requires E.164 phone
   * numbers and Braze prefers them.
   *
   * See https://docs.knock.app/api-reference/users/update
   * See https://www.braze.com/docs/user_guide/message_building_by_channel/sms_mms_rcs/user_phone_numbers
   */
  private normalizeTraits(params: { logParams: LogContext; traits: Traits }): Traits {
    const { logParams, traits } = params;

    const normalized = { ...traits };
    if (traits.phone && typeof traits.phone === "string") {
      const result = formatPhoneAsE164({ phone: traits.phone });

      if (E.isLeft(result)) {
        this.log({
          logParams,
          message: result.left.issues.map((issue) => issue.message).join(", "),
          logFunction: this.logger.error,
          metadata: { traits },
        });
      } else {
        normalized.phone = result.right;
      }
    }

    return normalized;
  }

  private log(params: {
    logFunction?: LogFunction;
    logParams: LogContext;
    message?: string;
    metadata?: Record<string, unknown>;
  }): void {
    const { logParams, logFunction = this.logger.info, message, metadata } = params;

    logFunction(message ? `${logParams.traceName}: ${message}` : logParams.traceName, {
      ...logParams,
      ...metadata,
    });
  }
}
