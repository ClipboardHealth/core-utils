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

/**
 * @deprecated Use `IdempotencyKeyParts` instead.
 */
export interface IdempotencyKey {
  eventOccurredAt?: string | undefined;
  resourceId?: string | undefined;
}

export type IdempotencyKeyParts =
  | {
      /**
       * Prefer `resourceId` over `eventOccurredAt`; it's harder to misuse.
       *
       * If an event triggered your workflow and it doesn't have a unique ID, you may decide to use its
       * occurrence timestamp. For example, if you have a daily CRON job, use the date it ran.
       *
       * Use `.toISOString()`.
       */
      eventOccurredAt: string;

      resource?: undefined;
    }
  | {
      eventOccurredAt?: undefined;

      /**
       * Do not include `workflowKey`, `recipients`, or `workplaceId`; they are included
       * automatically.
       *
       * If a resource triggered your workflow, include its unique ID.
       *
       * @example
       * 1. For a "meeting starts in one hour" notification, set resourceId to the meeting ID.
       * 2. For a payout notification, set resourceId to the payment ID.
       */
      resource: { type: string; id: string };
    };

export interface NotificationEnqueueData {
  /**
   * @deprecated Use `idempotencyKeyParts` instead.
   */
  idempotencyKey?: IdempotencyKey;

  /**
   * Do not include `workflowKey`, `recipients`, or `workplaceId`; they are included
   * automatically.
   *
   * Idempotency keys prevent duplicate notifications. They should be deterministic and remain the
   * same across retry logic.
   *
   * If you retry a request with the same idempotency key within 24 hours, the client returns the
   * same response as the original request.
   *
   * We provide this class because idempotency keys can be difficult to use correctly. If the key
   * changes on each retry (e.g., Date.now() or uuid.v4()), it won't prevent duplicate
   * notifications. Conversely, if you don't provide enough information, you prevent recipients from
   * receiving notifications they otherwise should have. For example, if you use the trigger key and
   * the recipient's ID as the idempotency key, but it's possible the recipient could receive the
   * same notification multiple times within the idempotency key's validity window, the recipient
   * will only receive the first notification.
   */
  idempotencyKeyParts?: IdempotencyKeyParts;

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
   *   EXAMPLE_NOTIFICATION_JOB_NAME,
   *   type ExampleNotificationData,
   * } from "./exampleNotification.job";
   * import { notificationJobEnqueuer } from "./notificationJobEnqueuer";
   * import { WORKFLOW_KEYS } from "./workflowKeys";
   *
   * async function enqueueNotificationJob() {
   *   await notificationJobEnqueuer.enqueueOneOrMore<ExampleNotificationData["Enqueue"]>(
   *     EXAMPLE_NOTIFICATION_JOB_NAME,
   *     // Important: Read the TypeDoc documentation for additional context.
   *     {
   *       /**
   *        * Set expiresAt at enqueue-time so it remains stable across job retries. Use date-fns in your
   *        * service instead of this manual calculation.
   *        *\/
   *       expiresAt: new Date(Date.now() + 60 * 60_000).toISOString(),
   *       // Set idempotencyKeyParts at enqueue-time so it remains stable across job retries.
   *       idempotencyKeyParts: {
   *         resource: {
   *           type: "account",
   *           id: "4e3ffeec-1426-4e54-ad28-83246f8f4e7c",
   *         },
   *       },
   *       // Set recipients at enqueue-time so they respect our notification provider's limits.
   *       recipients: ["userId-1"],
   *
   *       workflowKey: WORKFLOW_KEYS.eventStartingReminder,
   *
   *       // Any additional enqueue-time data passed to the job:
   *       workplaceId: "workplaceId-123",
   *     },
   *   );
   * }
   *
   * // eslint-disable-next-line unicorn/prefer-top-level-await
   * void enqueueNotificationJob();
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
          ...data.idempotencyKeyParts,
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
