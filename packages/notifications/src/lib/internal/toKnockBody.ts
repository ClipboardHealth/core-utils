import { type Knock } from "@knocklabs/node";

import type { InlineIdentifyUserRequest, RecipientRequest, TriggerBody } from "../types";
import { formatPhoneNumber } from "./formatPhoneNumber";

export function toKnockBody(body: TriggerBody): Knock.Workflows.WorkflowTriggerParams {
  const { actor, cancellationKey, recipients, workplaceId, ...rest } = body;

  return {
    ...(actor ? { actor: toKnockRecipient(actor) } : {}),
    ...(cancellationKey ? { cancellation_key: cancellationKey } : {}),
    ...(workplaceId ? { tenant: workplaceId } : {}),
    recipients: recipients.map(toKnockRecipient),
    ...rest,
  };
}

function toKnockRecipient(recipient: RecipientRequest): Knock.Recipients.RecipientRequest {
  if (typeof recipient === "string") {
    return recipient;
  }

  return toKnockInlineIdentifyUserRequest(recipient);
}

function toKnockInlineIdentifyUserRequest(
  recipient: InlineIdentifyUserRequest,
): Knock.Users.InlineIdentifyUserRequest {
  const {
    channelData,
    createdAt,
    email,
    name,
    phoneNumber,
    timeZone,
    userId,
    customProperties,
    ...rest
  } = recipient;

  return {
    ...customProperties,
    id: userId,
    ...(channelData ? { channel_data: channelData } : {}),
    ...(createdAt ? { created_at: createdAt.toISOString() } : {}),
    ...(email ? { email } : {}),
    ...(name ? { name } : {}),
    ...(phoneNumber ? { phone_number: formatPhoneNumber({ phoneNumber }) } : {}),
    ...(timeZone ? { timezone: timeZone } : {}),
    ...rest,
  };
}
