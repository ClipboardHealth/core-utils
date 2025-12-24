import { type Knock } from "@knocklabs/node";

import type {
  RecipientRequest,
  SerializableRecipientRequest,
  SerializableTriggerBody,
  TriggerBody,
} from "../types";
import { toInlineIdentifyUserRequest } from "./toInlineIdentifyUserRequest";

export function toTriggerBody(
  body: TriggerBody | SerializableTriggerBody,
): Knock.Workflows.WorkflowTriggerParams {
  const { actor, cancellationKey, recipients, workplaceId, ...rest } = body;

  return {
    ...(actor ? { actor: toRecipient(actor) } : {}),
    ...(cancellationKey ? { cancellation_key: cancellationKey } : {}),
    ...(workplaceId ? { tenant: workplaceId } : {}),
    recipients: recipients.map(toRecipient),
    ...rest,
  };
}

function toRecipient(
  recipient: RecipientRequest | SerializableRecipientRequest,
): Knock.Recipients.RecipientRequest {
  if (typeof recipient === "string") {
    return recipient;
  }

  return toInlineIdentifyUserRequest(recipient);
}
