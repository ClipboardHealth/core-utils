import { type Knock } from "@knocklabs/node";

import type { Attachment, RecipientRequest, TriggerBody } from "../types";
import { toInlineIdentifyUserRequest } from "./toInlineIdentifyUserRequest";

export function toTriggerBody(body: TriggerBody): Knock.Workflows.WorkflowTriggerParams {
  const { actor, attachments, cancellationKey, data, recipients, workplaceId } = body;

  return {
    ...(actor ? { actor: toRecipient(actor) } : {}),
    ...(cancellationKey ? { cancellation_key: cancellationKey } : {}),
    ...(workplaceId ? { tenant: workplaceId } : {}),
    recipients: recipients.map(toRecipient),
    ...((data ?? attachments)
      ? {
          data: {
            ...data,
            ...(attachments ? { attachments: attachments.map(toKnockAttachment) } : {}),
          },
        }
      : {}),
  };
}

function toKnockAttachment(attachment: Attachment): Record<string, string> {
  return {
    name: attachment.name,
    content_type: attachment.contentType,
    content: attachment.content,
  };
}

function toRecipient(recipient: RecipientRequest): Knock.Recipients.RecipientRequest {
  if (typeof recipient === "string") {
    return recipient;
  }

  return toInlineIdentifyUserRequest(recipient);
}
