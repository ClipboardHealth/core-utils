import {
  type RecipientRequest,
  type SerializableRecipientRequest,
  type SerializableTriggerChunkedRequest,
  type TriggerChunkedRequest,
} from "./types";

/**
 * Converts a serializable request to a TriggerChunkedRequest.
 */
export function toTriggerChunkedRequest(
  request: SerializableTriggerChunkedRequest,
  params: { attempt: number; idempotencyKey: string },
): TriggerChunkedRequest {
  const { body, expiresAt, ...rest } = request;
  const { actor, recipients, ...bodyRest } = body;

  return {
    ...rest,
    attempt: params.attempt,
    body: {
      ...bodyRest,
      ...(actor && { actor: toRecipientRequest(actor) }),
      recipients: recipients.map(toRecipientRequest),
    },
    expiresAt: new Date(expiresAt),
    idempotencyKey: params.idempotencyKey,
  };
}

function toRecipientRequest(recipient: SerializableRecipientRequest): RecipientRequest {
  if (typeof recipient === "string") {
    return recipient;
  }

  return {
    ...recipient,
    createdAt: recipient.createdAt ? new Date(recipient.createdAt) : undefined,
  };
}
