// embedex: packages/notifications/README.md

### `triggerChunked`

`triggerChunked` stores the full, immutable trigger request at job enqueue time, eliminating issues with stale data, chunking requests to stay under provider limits, and idempotency key conflicts that can occur if the request is updated at job execution time.

1. Search your service for `triggerNotification.constants.ts`, `triggerNotification.job.ts` and `notifications.service.ts`. If they don't exist, create them:

   <embedex source="packages/notifications/examples/triggerNotification.constants.ts">

   ```ts
   // triggerNotification.constants.ts
   export const TRIGGER_NOTIFICATION_JOB_NAME = "TriggerNotificationJob";
   ```

   </embedex>

   <embedex source="packages/notifications/examples/triggerNotification.job.ts">

   ```ts
   // triggerNotification.job.ts
   import { type BaseHandler } from "@clipboard-health/background-jobs-adapter";
   import {
     ERROR_CODES,
     type SerializableTriggerChunkedRequest,
     toTriggerChunkedRequest,
   } from "@clipboard-health/notifications";
   import { isFailure } from "@clipboard-health/util-ts";

   import { type NotificationsService } from "./notifications.service";
   import { CBHLogger } from "./setup";
   import { TRIGGER_NOTIFICATION_JOB_NAME } from "./triggerNotification.constants";

   /**
    * For @clipboard-health/mongo-jobs:
    * 1. Implement `HandlerInterface<SerializableTriggerChunkedRequest>`.
    * 2. The 10 default `maxAttempts` with exponential backoff of `2^attemptsCount` means ~17 minutes
    *    of cumulative delay. If your notification could be stale before this, set
    *    `SerializableTriggerChunkedRequest.expiresAt` when enqueueing.
    *
    * For @clipboard-health/background-jobs-postgres:
    * 1. Implement `Handler<SerializableTriggerChunkedRequest>`.
    * 2. The 20 default `maxRetryAttempts` with exponential backoff of `10s * 2^(attempt - 1)` means
    *    ~121 days of cumulative delay. If your notification could be stale before this, set
    *    `maxRetryAttempts` (and `SerializableTriggerChunkedRequest.expiresAt`) when enqueueing.
    */
   export class TriggerNotificationJob implements BaseHandler<SerializableTriggerChunkedRequest> {
     // For background-jobs-postgres, use `public static queueName = TRIGGER_NOTIFICATION_JOB_NAME;`
     public name = TRIGGER_NOTIFICATION_JOB_NAME;
     private readonly logger = new CBHLogger({
       defaultMeta: {
         logContext: TRIGGER_NOTIFICATION_JOB_NAME,
       },
     });

     public constructor(private readonly service: NotificationsService) {}

     public async perform(
       data: SerializableTriggerChunkedRequest,
       /**
        * For mongo-jobs, implement `BackgroundJobType<SerializableTriggerChunkedRequest>`, which has
        *    `_id`, `attemptsCount`, and `uniqueKey`.
        *
        * For background-jobs-postgres, implement `Job<SerializableTriggerChunkedRequest>`, which has
        *    `id`, `retryAttempts`, and `idempotencyKey`.
        */
       job: { _id: string; attemptsCount: number; uniqueKey?: string },
     ) {
       const metadata = {
         // For background-jobs-postgres, this is called `retryAttempts`.
         attempt: job.attemptsCount + 1,
         jobId: job._id,
         recipientCount: data.body.recipients.length,
         workflowKey: data.workflowKey,
       };
       this.logger.info("TriggerNotificationJob processing", metadata);

       try {
         const request = toTriggerChunkedRequest(data, {
           attempt: metadata.attempt,
           idempotencyKey: job.uniqueKey ?? metadata.jobId,
           // In case the tests are moving the time forward we need to ensure notifications don't expire.
           // ...(isTestMode && { expiresAt: new Date(3000, 0, 1) }),
         });
         const result = await this.service.triggerChunked(request);

         if (isFailure(result)) {
           // Skip expired notifications, retrying the job won't help.
           if (result.error.issues[0]?.code === ERROR_CODES.expired) {
             this.logger.warn("TriggerNotificationJob skipped due to expiry", { ...metadata });
             return;
           }

           throw result.error;
         }

         const success = "TriggerNotificationJob success";
         this.logger.info(success, { ...metadata, response: result.value });
         // For background-jobs-postgres, return the `success` string result.
       } catch (error) {
         this.logger.error("TriggerNotificationJob failure", { ...metadata, error });
         throw error;
       }
     }
   }
   ```

   </embedex>

   <embedex source="packages/notifications/examples/notifications.service.ts">

   ```ts
   // notifications.service.ts
   import { NotificationClient } from "@clipboard-health/notifications";

   import { CBHLogger, toLogger, tracer } from "./setup";

   export class NotificationsService {
     private readonly client: NotificationClient;

     constructor() {
       this.client = new NotificationClient({
         apiKey: "YOUR_KNOCK_API_KEY",
         logger: toLogger(new CBHLogger()),
         tracer,
       });
     }

     async triggerChunked(
       params: Parameters<NotificationClient["triggerChunked"]>[0],
     ): ReturnType<NotificationClient["triggerChunked"]> {
       return await this.client.triggerChunked(params);
     }
   }
   ```

   </embedex>

2. Search the service for a constant that stores workflow keys. If there isn't one, create it:

   <embedex source="packages/notifications/examples/workflowKeys.ts">

   ```ts
   /* eslint sort-keys: "error" */

   /**
    * Alphabetical list of workflow keys.
    */
   export const WORKFLOW_KEYS = {
     eventStartingReminder: "event-starting-reminder",
   } as const;
   ```

   </embedex>

3. Build your `SerializableTriggerChunkedRequest` and enqueue your job. Think of queuing `TriggerNotificationJob` as a function call to send notifications in a best practices way. You should NOT call `triggerChunked` directly. If, for example, your notification is delayed, create a background job that runs in the future, does any necessary checks to ensure you should notify, and then queue `TriggerNotificationJob`.

   <embedex source="packages/notifications/examples/enqueueTriggerNotificationJob.ts">

   ```ts
   import { type BackgroundJobsAdapter } from "@clipboard-health/background-jobs-adapter";
   import { type SerializableTriggerChunkedRequest } from "@clipboard-health/notifications";

   import { BackgroundJobsService } from "./setup";
   import { TRIGGER_NOTIFICATION_JOB_NAME } from "./triggerNotification.constants";
   import { WORKFLOW_KEYS } from "./workflowKeys";

   /**
    * Enqueue a notification job in the same database transaction as the changes it's notifying about.
    * The `session` option is called `transaction` in `background-jobs-postgres`.
    */
   async function enqueueTriggerNotificationJob(adapter: BackgroundJobsAdapter) {
     // Assume this comes from a database and are used as template variables...
     const notificationData = {
       favoriteColor: "blue",
       // Use @clipboard-health/date-time's formatShortDateTime in your service for consistency.
       favoriteAt: new Date().toISOString(),
       secret: "2",
     };

     const jobData: SerializableTriggerChunkedRequest = {
       // Important: Read the TypeDoc documentation for additional context.
       body: {
         recipients: ["userId-1", "userId-2"],
         data: notificationData,
       },
       // Helpful when controlling notifications with feature flags.
       dryRun: false,
       // Set expiresAt at enqueue-time so it remains stable across job retries. Use date-fns in your
       // service instead of this manual calculation.
       expiresAt: new Date(Date.now() + 60 * 60_000).toISOString(),
       // Keys to redact from logs
       keysToRedact: ["secret"],
       workflowKey: WORKFLOW_KEYS.eventStartingReminder,
     };

     // Option 1 (default): Automatically use background job ID as idempotency key.
     await adapter.enqueue(TRIGGER_NOTIFICATION_JOB_NAME, jobData, { session: "..." });

     // Option 2 (advanced): Provide custom idempotency key to job and notification libraries for more
     // control. You'd use this to provide enqueue-time deduplication. For example, if you enqueue when
     // a user clicks a button and only want them to receive one notification.
     await adapter.enqueue(TRIGGER_NOTIFICATION_JOB_NAME, jobData, {
       // Called `idempotencyKey` in `background-jobs-postgres`.
       unique: `meeting-123-reminder`,
       session: "...",
     });
   }

   // eslint-disable-next-line unicorn/prefer-top-level-await
   void enqueueTriggerNotificationJob(
     // Use your instance of `@clipboard-health/mongo-jobs` or `@clipboard-health/background-jobs-postgres` here.
     new BackgroundJobsService(),
   );
   ```

   </embedex>
