import { type Knock } from "@knocklabs/node";

import type { InlineIdentifyUserRequest, SerializableInlineIdentifyUserRequest } from "../types";
import { toInlineIdentifyUserRequestWithoutUserId } from "./toInlineIdentifyUserRequestWithoutUserId";

export function toInlineIdentifyUserRequest(
  recipient: InlineIdentifyUserRequest | SerializableInlineIdentifyUserRequest,
): Knock.Users.InlineIdentifyUserRequest {
  const { userId, ...rest } = recipient;

  return {
    ...toInlineIdentifyUserRequestWithoutUserId(rest),
    id: userId,
  };
}
