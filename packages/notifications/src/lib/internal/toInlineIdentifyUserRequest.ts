import type Knock from "@knocklabs/node";

import { type InlineIdentifyUserRequest } from "../types";
import { formatPhoneNumber } from "./formatPhoneNumber";

export function toInlineIdentifyUserRequest(
  recipient: InlineIdentifyUserRequest,
): Knock.Users.InlineIdentifyUserRequest {
  const { userId, ...rest } = recipient;

  return {
    ...toInlineIdentifyUserRequestWithoutUserId(rest),
    id: userId,
  };
}

export function toInlineIdentifyUserRequestWithoutUserId(
  recipient: Omit<InlineIdentifyUserRequest, "userId">,
): Omit<Knock.Users.InlineIdentifyUserRequest, "id"> {
  const { channelData, createdAt, email, name, phoneNumber, timeZone, customProperties, ...rest } =
    recipient;

  return {
    ...customProperties,
    ...(channelData ? { channel_data: channelData } : {}),
    ...(createdAt ? { created_at: createdAt.toISOString() } : {}),
    ...(email ? { email } : {}),
    ...(name ? { name } : {}),
    ...(phoneNumber ? { phone_number: formatPhoneNumber({ phoneNumber }) } : {}),
    ...(timeZone ? { timezone: timeZone } : {}),
    ...rest,
  };
}
