import { type Knock } from "@knocklabs/node";

import type { InlineIdentifyUserRequest } from "../types";
import { toInlineIdentifyUserRequestWithoutUserId } from "./toInlineIdentifyUserRequestWithoutUserId";

export function toInlineIdentifyUserRequest(
  recipient: InlineIdentifyUserRequest,
): Knock.Users.InlineIdentifyUserRequest {
  const { userId, ...rest } = recipient;

  return {
    ...toInlineIdentifyUserRequestWithoutUserId(rest),
    id: userId,
  };
}
