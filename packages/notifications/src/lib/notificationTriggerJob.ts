import {
  type BackgroundJobsAdapter,
  ENQUEUE_FIELD_NAMES,
} from "@clipboard-health/background-jobs-adapter";

import { type IdempotencyKey } from "./idempotencyKey";
import { chunkRecipients } from "./internal/chunkRecipients";
import { IdempotencyKeyDoNotImportOutsideNotificationsLibrary } from "./internal/idempotencyKeyDoNotImportOutsideNotificationsLibrary";
import { ERROR_CODES, type ErrorCode } from "./notificationClient";
import {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  type TriggerBody,
  type TriggerRequest,
} from "./types";

/**
 * Assuming `NotificationClient` is called from a background job with unchanging recipients, only
 * the following are retryable.
 */
export const RETRYABLE_ERRORS: ErrorCode[] = [ERROR_CODES.unknown];

type EnqueueParameters = Parameters<BackgroundJobsAdapter["enqueue"]>;

export interface NotificationEnqueueData {
  idempotencyKey: IdempotencyKey;

  /** @see {@link TriggerRequest.expiresAt} */
  expiresAt: TriggerRequest["expiresAt"];

  /** @see {@link TriggerBody.recipients} */
  recipients: string[];

  /** @see {@link TriggerRequest.workflowKey} */
  workflowKey: string;
}

export interface NotificationJobData extends Omit<NotificationEnqueueData, "idempotencyKey"> {
  idempotencyKey: IdempotencyKeyDoNotImportOutsideNotificationsLibrary;
}

interface NotificationTriggerJobParams {
  adapter: BackgroundJobsAdapter;
}

export class NotificationTriggerJob {
  private readonly adapter: NotificationTriggerJobParams["adapter"];

  /**
   *
   */
  constructor(params: NotificationTriggerJobParams) {
    const { adapter } = params;

    this.adapter = adapter;
  }

  /**
   * In short: It's important that notification trigger jobs use this method. It enforces best
   * practices to ensure customers don't receive duplicate or stale notifications.
   *
   * @remarks
   * The following are true:
   * 1. There is a maximum of 1000 recipients per trigger request.
   * 2. Our notification provider throws if we use the same idempotency key, but the body changes.
   * 3. We want to be able to query for template variables in jobs so we're getting the most
   *    up-to-date values.
   *
   * Taken together, we need to ensure each job only contains one chunk of recipients so it either
   * succeeds or fails and retries on its own. If we moved chunking to the
   * `NotificationClient.trigger` method, for example, the following could happen:
   * 1. A job with >1000 recipients runs.
   * 2. The first chunk succeeds, but the second fails because of a transient issue.
   * 3. The job retries, but a first batch template variable changes in the meantime.
   *
   * Now the job will fail indefinitely and the later batches won't get their notifications.
   *
   * Even if you're sure you won't have more >1000 recipients, the method enforces other best
   * practices, like setting `expiresAt` on enqueue instead of calculating it in your job on each
   * run. Doing this usually means it's always in the future and doesn't help prevent stale
   * notifications.
   *
   * So please, use this method if not for customers, then to save fellow engineers time debugging!
   *
   * @example
   * <embedex source="packages/notifications/examples/enqueueNotificationJob.ts">
   *
   * ```ts
   * import { IdempotencyKey } from "../src";
   * import { ExampleNotificationJob } from "./exampleNotification.job";
   * import { notificationTriggerJob } from "./notificationTriggerJob";
   *
   * async function enqueueNotificationJob() {
   *   await notificationTriggerJob.enqueueOneOrMore(ExampleNotificationJob, {
   *     // Set expiresAt at enqueue-time so it remains stable across job retries.
   *     expiresAt: minutesFromNow(60),
   *     // Set idempotencyKey at enqueue-time so it remains stable across job retries.
   *     idempotencyKey: new IdempotencyKey({
   *       resourceId: "event-123",
   *     }),
   *     // Set recipients at enqueue-time so they respect our notification provider's limits.
   *     recipients: ["user-1"],
   *
   *     workflowKey: "event-starting-reminder",
   *
   *     // Any additional enqueue-time data passed to the job:
   *     workplaceId: "workplace-123",
   *   });
   * }
   *
   * // eslint-disable-next-line unicorn/prefer-top-level-await
   * void enqueueNotificationJob();
   *
   * function minutesFromNow(minutes: number) {
   *   return new Date(Date.now() + minutes * 60_000);
   * }
   * ```
   *
   * </embedex>
   */
  async enqueueOneOrMore<T extends NotificationEnqueueData>(
    handlerClassOrInstance: EnqueueParameters[0],
    data: T,
    // The job's idempotency/unique key is set automatically.
    options?: Omit<EnqueueParameters[2], "idempotencyKey" | "unique">,
  ) {
    const { idempotencyKey, recipients, workflowKey, ...rest } = data;

    await Promise.all(
      chunkRecipients({ recipients }).map(async (chunk) => {
        const key = new IdempotencyKeyDoNotImportOutsideNotificationsLibrary({
          chunk: chunk.number,
          eventOccurredAt: idempotencyKey.eventOccurredAt,
          recipients: chunk.recipients,
          resourceId: idempotencyKey.resourceId,
          workflowKey,
        });

        await this.adapter.enqueue(
          handlerClassOrInstance,
          {
            ...rest,
            recipients: chunk.recipients,
            idempotencyKey: key,
          },
          {
            ...(options ? { ...options } : {}),
            [ENQUEUE_FIELD_NAMES[this.adapter.implementation].idempotencyKey]: key.toString(),
          },
        );
      }),
    );
  }
}
