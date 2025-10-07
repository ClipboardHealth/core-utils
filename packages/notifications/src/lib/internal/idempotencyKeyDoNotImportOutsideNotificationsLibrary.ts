import { IdempotencyKey, type IdempotencyKeyParams } from "../idempotencyKey";
import {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  type NotificationTriggerJob,
} from "../notificationTriggerJob";
import { createDeterministicHash } from "./createDeterministicHash";

const EMPTY = "-";

const SEPARATOR = ":";

const MAXIMUM_WORKFLOW_KEY_LENGTH = 128;

interface IdempotencyKeyDoNotImportOutsideNotificationsLibraryParams extends IdempotencyKeyParams {
  /**
   * The recipient chunk number.
   */
  chunk: number;

  /**
   * The recipients in the chunk; maximum of 1000.
   */
  recipients: string[];

  /**
   * The workflow key.
   */
  workflowKey: string;
}

/**
 * `NotificationClient.trigger` should be called after properly enqueuing a job using
 * `NotificationTriggerJob.enqueueOneOrMore` to help ensure we're following best practices so
 * customers don't receive duplicate or stale notifications.
 *
 * Yes, you could import this class into your service and call `NotificationClient.trigger`
 * directly. We're using the honor system in hopes that enforcement is unnecessary.
 *
 * @see {@link NotificationTriggerJob.enqueueOneOrMore}.
 */
export class IdempotencyKeyDoNotImportOutsideNotificationsLibrary extends IdempotencyKey {
  public readonly chunk: IdempotencyKeyDoNotImportOutsideNotificationsLibraryParams["chunk"];
  public readonly recipients: IdempotencyKeyDoNotImportOutsideNotificationsLibraryParams["recipients"];
  public readonly workflowKey: IdempotencyKeyDoNotImportOutsideNotificationsLibraryParams["workflowKey"];

  constructor(params: IdempotencyKeyDoNotImportOutsideNotificationsLibraryParams) {
    const { chunk, recipients, workflowKey, ...rest } = params;

    super(rest);
    this.chunk = chunk;
    this.recipients = recipients;
    this.workflowKey = workflowKey;
  }

  override toString(): string {
    return join({
      values: [this.toStringWithoutRecipients({}), createDeterministicHash(this.recipients)],
    });
  }

  /**
   * We have a MAXIMUM_IDEMPOTENCY_KEY_LENGTH limit. The key is made up of the following:
   *
   * - MAXIMUM_WORKFLOW_KEY_LENGTH-character workflowKey
   * - 1-character separator
   * - Likely 4-character max chunk
   * - 1-character separator
   * - Likely 36-character max resourceId
   * - 1-character separator
   * - 13-character eventOccurredAt
   * - 1-character separator
   * - 32-character hash
   *
   * 217-character total. Slice to lengthLimit for safety.
   */
  toStringWithBodyHash(params: { hash: string; lengthLimit: number }): string {
    const { hash, lengthLimit } = params;

    // hash contains recipients, so don't include them twice.
    return join({ values: [this.toStringWithoutRecipients({}), hash], lengthLimit });
  }

  /**
   * @see {@link toStringWithBodyHash}'s comment prior to making changes.
   */
  private toStringWithoutRecipients(params: { lengthLimit?: number }): string {
    const { lengthLimit } = params;

    return join({
      values: [
        this.workflowKey.slice(0, MAXIMUM_WORKFLOW_KEY_LENGTH),
        this.chunk,
        this.resourceId ?? EMPTY,
        this.eventOccurredAt?.getTime() ?? EMPTY,
      ],
      lengthLimit,
    });
  }
}

/**
 * @see {@link IdempotencyKeyDoNotImportOutsideNotificationsLibrary.toStringWithBodyHash}'s comment prior to making changes.
 */
function join(params: {
  values: Array<string | number>;
  lengthLimit?: number | undefined;
}): string {
  const { values, lengthLimit } = params;

  return values.join(SEPARATOR).slice(0, lengthLimit);
}
