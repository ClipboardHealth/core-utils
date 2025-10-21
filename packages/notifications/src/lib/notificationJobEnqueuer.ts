import {
  type BackgroundJobsAdapter,
  ENQUEUE_FIELD_NAMES,
  type EnqueueOptions,
  type MongoEnqueueOptions,
  type PostgresEnqueueOptions,
} from "@clipboard-health/background-jobs-adapter";

import { chunkRecipients } from "./internal/chunkRecipients";
import { triggerIdempotencyKeyParamsToHash } from "./internal/triggerIdempotencyKeyParamsToHash";
import {
  DO_NOT_CALL_THIS_OUTSIDE_OF_TESTS,
  type TriggerIdempotencyKey,
  type TriggerIdempotencyKeyParams,
} from "./triggerIdempotencyKey";
import {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  type TriggerBody,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  type TriggerRequest,
} from "./types";

type EnqueueParameters = Parameters<BackgroundJobsAdapter["enqueue"]>;

export interface IdempotencyKey {
  /**
   * Prefer `resourceId` over `eventOccurredAt`; it's harder to misuse.
   *
   * If an event triggered your workflow and it doesn't have a unique ID, you may decide to use its
   * occurrence timestamp. For example, if you have a daily CRON job, use the date it ran.
   *
   * Use `.toISOString()`.
   */
  eventOccurredAt?: string | undefined;

  /**
   * If a resource triggered your workflow, include its unique ID.
   *
   * Note: `workflowKey`, `recipients`, and `workplaceId` (if it exists in the trigger body) are
   * included in the idempotency key automatically.
   *
   * @example
   * 1. For a "meeting starts in one hour" notification, set resourceId to the meeting ID.
   * 2. For a payout notification, set resourceId to the payment ID.
   */
  resourceId?: string | undefined;
}

export interface NotificationEnqueueData {
  /**
   * Idempotency keys prevent duplicate notifications. They should be deterministic and remain the
   * same across retry logic.
   *
   * If you retry a request with the same idempotency key within 24 hours, the client returns the same
   * response as the original request.
   *
   * Note: `workflowKey`, `recipients`, and `workplaceId` (if it exists in the trigger body) are
   * included in the idempotency key automatically.
   *
   * We provide this class because idempotency keys can be difficult to use correctly. If the key
   * changes on each retry (e.g., Date.now() or uuid.v4()), it won't prevent duplicate notifications.
   * Conversely, if you don't provide enough information, you prevent recipients from receiving
   * notifications they otherwise should have. For example, if you use the trigger key and the
   * recipient's ID as the idempotency key, but it's possible the recipient could receive the same
   * notification multiple times within the idempotency key's validity window, the recipient will only
   * receive the first notification.
   */
  idempotencyKey: IdempotencyKey;

  /** @see {@link TriggerRequest.expiresAt} */
  expiresAt: string;

  /** @see {@link TriggerBody.recipients} */
  recipients: string[];

  /** @see {@link TriggerRequest.workflowKey} */
  workflowKey: string;
}

export interface NotificationJobData extends Omit<NotificationEnqueueData, "idempotencyKey"> {
  idempotencyKey: TriggerIdempotencyKey;
}

/**
 * Type utility to create Job and Enqueue data type variants.
 *
 * @example
 * ```ts
 * type MyNotificationData = NotificationData<{
 *   name: string;
 *   age: number;
 * }>;
 *
 * export class MyNotificationJob implements HandlerInterface<MyNotificationData["Job"]> {
 *   ...
 * }
 *
 * await notificationJobEnqueuer.enqueueOneOrMore<MyNotificationData["Enqueue"]>(
 *   ...
 * );
 * ```
 */
export interface NotificationData<T> {
  Job: NotificationJobData & T;
  Enqueue: NotificationEnqueueData & T;
}

/**
 * `enqueueOneOrMore` sets `idempotencyKey`/`unique` automatically, so it's not accepted here.
 *
 * Use `startAt` with care to prevent stale recipient lists. To prevent stale recipient lists, it
 * may make more sense to schedule a normal job in the future that, when executed, looks up
 * recipients and queues a notification job that runs immediately.
 *
 * There are valid use cases for `startAt`, however. For example, if you do checks in your job (or
 * in a service the job calls) to validate the notification is still valid prior to triggering it.
 */
export type EnqueueOneOrMoreOptions = Pick<EnqueueOptions, "startAt"> &
  (
    | Pick<MongoEnqueueOptions, "session" | "startAt">
    | Pick<PostgresEnqueueOptions, "transaction" | "startAt">
  );

interface NotificationJobEnqueuerParams {
  adapter: BackgroundJobsAdapter;
}

export class NotificationJobEnqueuer {
  private readonly adapter: NotificationJobEnqueuerParams["adapter"];

  constructor(params: NotificationJobEnqueuerParams) {
    const { adapter } = params;

    this.adapter = adapter;
  }

  /**
   * In short: It's important that notification jobs use this method. It enforces best practices to
   * ensure customers don't receive duplicate or stale notifications.
   *
   * @remarks
   * The following are true:
   * 1. There is a maximum of MAXIMUM_RECIPIENTS_COUNT recipients per trigger request.
   * 2. Our notification provider throws if we use the same idempotency key, but the body changes.
   * 3. We want to be able to query for template variables in jobs so we're getting the most
   *    up-to-date values.
   *
   * Taken together, we need to ensure each job only contains one chunk of recipients so it either
   * succeeds or fails and retries on its own. If we moved chunking to the
   * `NotificationClient.trigger` method, for example, the following could happen:
   * 1. A job with >MAXIMUM_RECIPIENTS_COUNT recipients runs.
   * 2. The first chunk succeeds, but the second fails because of a transient issue.
   * 3. The job retries, but a first batch template variable changes in the meantime.
   *
   * Now the job will fail indefinitely and the later batches won't get their notifications.
   *
   * Even if you're sure you won't have more >MAXIMUM_RECIPIENTS_COUNT recipients, the method
   * enforces other best practices, like setting `expiresAt` on enqueue instead of calculating it in
   * your job on each run. Doing this usually means it's always in the future and doesn't help
   * prevent stale notifications.
   *
   * So please, use this method if not for customers, then to save fellow engineers time debugging!
   *
   * @example
   * <embedex source="packages/notifications/examples/enqueueNotificationJob.ts">
   *
   * ```ts
   * import {
   *   type ExampleNotificationEnqueueData,
   *   ExampleNotificationJob,
   * } from "./exampleNotification.job";
   * import { notificationJobEnqueuer } from "./notificationJobEnqueuer";
   *
   * async function enqueueNotificationJob() {
   *   await notificationJobEnqueuer.enqueueOneOrMore<ExampleNotificationEnqueueData>(
   *     ExampleNotificationJob,
   *     {
   *       // Set expiresAt at enqueue-time so it remains stable across job retries.
   *       expiresAt: minutesFromNow(60).toISOString(),
   *       // Set idempotencyKey at enqueue-time so it remains stable across job retries.
   *       idempotencyKey: {
   *         resourceId: "event-123",
   *       },
   *       // Set recipients at enqueue-time so they respect our notification provider's limits.
   *       recipients: ["user-1"],
   *
   *       workflowKey: "event-starting-reminder",
   *
   *       // Any additional enqueue-time data passed to the job:
   *       workplaceId: "workplace-123",
   *     },
   *   );
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
  async enqueueOneOrMore<TEnqueueData extends NotificationEnqueueData>(
    handlerClassOrInstance: EnqueueParameters[0],
    data: TEnqueueData,
    options?: EnqueueOneOrMoreOptions,
  ) {
    await Promise.all(
      chunkRecipients({ recipients: data.recipients }).map(async ({ number, recipients }) => {
        const idempotencyKeyParams: TriggerIdempotencyKeyParams = {
          ...data.idempotencyKey,
          chunk: number,
          recipients,
          workflowKey: data.workflowKey,
        };

        await this.adapter.enqueue(
          handlerClassOrInstance,
          {
            ...data,
            recipients,
            idempotencyKey: DO_NOT_CALL_THIS_OUTSIDE_OF_TESTS(idempotencyKeyParams),
          },
          {
            ...(options ? { ...options } : {}),
            [ENQUEUE_FIELD_NAMES[this.adapter.implementation].idempotencyKey]:
              triggerIdempotencyKeyParamsToHash(idempotencyKeyParams),
          },
        );
      }),
    );
  }
}
