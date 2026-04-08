import { type UserSetPreferencesParams } from "@knocklabs/node/resources/index";
import { type PreferenceSetChannelTypes } from "@knocklabs/node/resources/recipients/preferences";

import {
  type ChannelTypePreferences,
  type PreferenceOverrides,
  type UpsertUserPreferencesRequest,
} from "../types";

function ifDefined<T>(value: unknown, partial: T) {
  return value === undefined ? {} : partial;
}

function toKnockChannelTypes(
  params: ChannelTypePreferences | null | undefined,
): PreferenceSetChannelTypes | null {
  if (params === null || params === undefined) {
    return null;
  }

  return {
    ...ifDefined(params.chat, { chat: params.chat }),
    ...ifDefined(params.email, { email: params.email }),
    ...ifDefined(params.http, { http: params.http }),
    ...ifDefined(params.inAppFeed, { in_app_feed: params.inAppFeed }),
    ...ifDefined(params.push, { push: params.push }),
    ...ifDefined(params.sms, { sms: params.sms }),
  };
}

function toKnockOverrides(
  params: boolean | PreferenceOverrides,
): boolean | UserSetPreferencesParams.PreferenceSetWorkflowCategorySettingObject {
  if (params === true || params === false) {
    return params;
  }

  return {
    ...ifDefined(params.channelTypes, { channel_types: toKnockChannelTypes(params.channelTypes) }),
    ...ifDefined(params.channels, { channels: params.channels }),
  };
}

function toKnockOverridesMap(
  params: Record<string, boolean | PreferenceOverrides> | null | undefined,
): Record<
  string,
  boolean | UserSetPreferencesParams.PreferenceSetWorkflowCategorySettingObject
> | null {
  if (params === null || params === undefined) {
    return null;
  }

  const result: Record<
    string,
    boolean | UserSetPreferencesParams.PreferenceSetWorkflowCategorySettingObject
  > = {};

  for (const [key, config] of Object.entries(params)) {
    result[key] = toKnockOverrides(config);
  }

  return result;
}

export function toKnockUserPreferences(
  params: UpsertUserPreferencesRequest,
): UserSetPreferencesParams {
  return {
    ...ifDefined(params.commercialSubscribed, {
      commercial_subscribed: params.commercialSubscribed,
    }),
    ...ifDefined(params.channelTypes, { channel_types: toKnockChannelTypes(params.channelTypes) }),
    ...ifDefined(params.channels, { channels: params.channels }),
    ...ifDefined(params.categories, { categories: toKnockOverridesMap(params.categories) }),
    ...ifDefined(params.workflows, { workflows: toKnockOverridesMap(params.workflows) }),
  };
}
