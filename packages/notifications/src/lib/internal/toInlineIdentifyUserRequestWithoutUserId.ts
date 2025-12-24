import { type Knock } from "@knocklabs/node";

import type { InlineIdentifyUserRequest, SerializableInlineIdentifyUserRequest } from "../types";
import { formatPhoneNumber } from "./formatPhoneNumber";

type RecipientWithoutUserId =
  | Omit<InlineIdentifyUserRequest, "userId">
  | Omit<SerializableInlineIdentifyUserRequest, "userId">;

export function toInlineIdentifyUserRequestWithoutUserId(
  recipient: RecipientWithoutUserId,
): Omit<Knock.Users.InlineIdentifyUserRequest, "id"> {
  const { channelData, createdAt, email, name, phoneNumber, timeZone, customProperties, ...rest } =
    recipient;

  return {
    ...rest,
    ...customProperties,
    ...(channelData ? { channel_data: channelData } : {}),
    ...(createdAt
      ? { created_at: typeof createdAt === "string" ? createdAt : createdAt.toISOString() }
      : {}),
    ...(email ? { email } : {}),
    ...(name ? { name } : {}),
    ...(phoneNumber ? { phone_number: formatPhoneNumber({ phoneNumber }) } : {}),
    ...(timeZone ? { timezone: timeZone } : {}),
  };
}
