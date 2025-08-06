import { either as E, type Logger } from "@clipboard-health/util-ts";
import { Analytics as SegmentAnalytics } from "@segment/analytics-node";

import { formatPhoneAsE164 } from "./formatPhoneAsE164";

export type UserId = string | number;

export interface CommonTraits {
  createdAt?: Date;
  email?: string;
  name?: string;
  phone?: string;
  type?: string;
}

export type Traits = Record<string, unknown> & Readonly<CommonTraits>;

export interface IdentifyRequest {
  userId: UserId;
  traits: Traits;
}

export interface TrackRequest {
  userId: UserId;
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

    if (!this.enabled.identify) {
      this.logger.info("Analytics identify is disabled, skipping", { params });
      return;
    }

    this.segment.identify({
      userId: String(userId),
      traits: this.normalizeTraits(traits),
    });
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

    if (!this.enabled.track) {
      this.logger.info("Analytics tracking is disabled, skipping", {
        params,
      });
      return;
    }

    this.segment.track({
      userId: String(userId),
      event,
      properties: traits,
    });
  }

  /**
   * Knock and Braze update user data based on Segment Identify events. Knock requires E.164 phone
   * numbers and Braze prefers them.
   *
   * See https://docs.knock.app/api-reference/users/update
   * See https://www.braze.com/docs/user_guide/message_building_by_channel/sms_mms_rcs/user_phone_numbers
   */
  private normalizeTraits(traits: Traits): Traits {
    const normalized = { ...traits };
    if (traits.phone && typeof traits.phone === "string") {
      const result = formatPhoneAsE164({ phone: traits.phone });

      if (E.isLeft(result)) {
        this.logger.error(result.left.issues.map((issue) => issue.message).join(", "), {
          phone: traits.phone,
        });
      } else {
        normalized.phone = result.right;
      }
    }

    return normalized;
  }
}
