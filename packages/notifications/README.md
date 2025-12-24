# @clipboard-health/notifications <!-- omit from toc -->

Send notifications through third-party providers.

## Table of contents <!-- omit from toc -->

- [`triggerChunked`](#triggerchunked)
- [`trigger`](#trigger)
- [Local development commands](#local-development-commands)

<embedex source="packages/notifications/examples/usage.md">

## `triggerChunked`

`triggerChunked` stores the full, immutable trigger request at job enqueue time, eliminating issues with stale data, chunking requests to stay under provider limits, and idempotency key conflicts that can occur if the request is updated at job execution time.

1. Search your service for `triggerNotification.constants.ts`, `triggerNotification.job.ts` and `notifications.service.ts`. If they don't exist, create them:

   ```ts
   export const TRIGGER_NOTIFICATION_JOB_NAME = "TriggerNotificationJob";
   ```

   ```ts
   import { type BaseHandler } from "@clipboard-health/background-jobs-adapter";
   import {
     type SerializableTriggerChunkedRequest,
     toTriggerChunkedRequest,
   } from "@clipboard-health/notifications";
   import { isFailure } from "@clipboard-health/util-ts";

   import { type NotificationsService } from "./notifications.service";
   import { CBHLogger } from "./setup";
   import { TRIGGER_NOTIFICATION_JOB_NAME } from "./triggerNotification.constants";

   /**
    * For mongo-jobs, implement HandlerInterface<SerializableTriggerChunkedRequest>.
    * For background-jobs-postgres, implement Handler<SerializableTriggerChunkedRequest>.
    */
   export class TriggerNotificationJob implements BaseHandler<SerializableTriggerChunkedRequest> {
     public name = TRIGGER_NOTIFICATION_JOB_NAME;
     private readonly logger = new CBHLogger({
       defaultMeta: {
         logContext: TRIGGER_NOTIFICATION_JOB_NAME,
       },
     });

     public constructor(private readonly service: NotificationsService) {}

     public async perform(
       data: SerializableTriggerChunkedRequest,
       job: { _id: string; attemptsCount: number; uniqueKey?: string },
     ) {
       const metadata = {
         // Include the job's attempts count for debugging, this is called `retryAttempts` in `background-jobs-postgres`.
         attempt: job.attemptsCount + 1,
         jobId: job._id,
         recipientCount: data.body.recipients.length,
         workflowKey: data.workflowKey,
       };
       this.logger.info("Processing", metadata);

       try {
         const request = toTriggerChunkedRequest(data, {
           attempt: metadata.attempt,
           idempotencyKey: job.uniqueKey ?? metadata.jobId,
         });
         const result = await this.service.triggerChunked(request);

         if (isFailure(result)) {
           throw result.error;
         }

         this.logger.info("Success", { ...metadata, response: result.value });
       } catch (error) {
         this.logger.error("Failure", { ...metadata, error });
         throw error;
       }
     }
   }
   ```

   ```ts
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

2. Search the service for a constant that stores workflow keys. If there isn't one, create it:

   ```ts
   /* eslint sort-keys: "error" */

   /**
    * Alphabetical list of workflow keys.
    */
   export const WORKFLOW_KEYS = {
     eventStartingReminder: "event-starting-reminder",
   } as const;
   ```

3. Build your `SerializableTriggerChunkedRequest` and enqueue your job:

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

## `trigger`

> [!WARNING]
> Deprecated. See `triggerChunked`.

1. Search your service for a `NotificationJobEnqueuer` instance. If there isn't one, create and export it:

   <embedex source="packages/notifications/examples/notificationJobEnqueuer.ts">

   ```ts
   import { NotificationJobEnqueuer } from "@clipboard-health/notifications";

   import { BackgroundJobsService } from "./setup";

   // Create and export one instance of this in your microservice.
   export const notificationJobEnqueuer = new NotificationJobEnqueuer({
     // Use your instance of `@clipboard-health/mongo-jobs` or `@clipboard-health/background-jobs-postgres` here.
     adapter: new BackgroundJobsService(),
   });
   ```

   </embedex>

2. Add types and the job name to the module's logic directory if it exists, else module root. You MUST create and use the `...DataJob` and `...DataEnqueue` types:

   <embedex source="packages/notifications/examples/exampleNotification.constants.ts">

   ```ts
   import { type NotificationData } from "@clipboard-health/notifications";

   type ExampleNotificationData = NotificationData<{
     workplaceId: string;
   }>;

   export type ExampleNotificationDataJob = ExampleNotificationData["Job"];
   export type ExampleNotificationDataEnqueue = ExampleNotificationData["Enqueue"];

   export type ExampleNotificationDo = ExampleNotificationDataJob & { attempt: number };

   export const EXAMPLE_NOTIFICATION_JOB_NAME = "ExampleNotificationJob";
   ```

   </embedex>

3. Implement a minimal job in the module's logic/job directory if it exists, else module root. The job calls off to a NestJS service for any business logic and to send the notification:

   <embedex source="packages/notifications/examples/exampleNotification.job.ts">

   ```ts
   import { type BaseHandler } from "@clipboard-health/background-jobs-adapter";
   import { isFailure } from "@clipboard-health/util-ts";

   import {
     EXAMPLE_NOTIFICATION_JOB_NAME,
     type ExampleNotificationDataJob,
   } from "./exampleNotification.constants";
   import { type ExampleNotificationService } from "./exampleNotification.service";
   import { CBHLogger } from "./setup";

   // For mongo-jobs, you'll implement HandlerInterface<ExampleNotificationDataJob>
   // For background-jobs-postgres, you'll implement Handler<ExampleNotificationDataJob>
   export class ExampleNotificationJob implements BaseHandler<ExampleNotificationDataJob> {
     public name = EXAMPLE_NOTIFICATION_JOB_NAME;
     private readonly logger = new CBHLogger({
       defaultMeta: {
         logContext: EXAMPLE_NOTIFICATION_JOB_NAME,
       },
     });

     constructor(private readonly service: ExampleNotificationService) {}

     async perform(data: ExampleNotificationDataJob, job: { attemptsCount: number }) {
       this.logger.info("Processing", {
         workflowKey: data.workflowKey,
       });

       try {
         const result = await this.service.sendNotification({
           ...data,
           // Include the job's attempts count for debugging, this is called `retryAttempts` in `background-jobs-postgres`.
           attempt: job.attemptsCount + 1,
         });

         if (isFailure(result)) {
           throw result.error;
         }

         this.logger.info("Success", {
           workflowKey: data.workflowKey,
         });
       } catch (error) {
         this.logger.error("Failure", { error, data });
         throw error;
       }
     }
   }
   ```

   </embedex>

4. Search the service for a constant that stores workflow keys. If there isn't one, create and export it:

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

5. Enqueue the job:

   <embedex source="packages/notifications/examples/enqueueNotificationJob.ts">

   ```ts
   import {
     EXAMPLE_NOTIFICATION_JOB_NAME,
     type ExampleNotificationDataEnqueue,
   } from "./exampleNotification.constants";
   import { notificationJobEnqueuer } from "./notificationJobEnqueuer";
   import { WORKFLOW_KEYS } from "./workflowKeys";

   async function enqueueNotificationJob() {
     await notificationJobEnqueuer.enqueueOneOrMore<ExampleNotificationDataEnqueue>(
       EXAMPLE_NOTIFICATION_JOB_NAME,
       // Important: Read the TypeDoc documentation for additional context.
       {
         /**
          * Set expiresAt at enqueue-time so it remains stable across job retries. Use date-fns in your
          * service instead of this manual calculation.
          */
         expiresAt: new Date(Date.now() + 60 * 60_000).toISOString(),
         // Set idempotencyKeyParts at enqueue-time so it remains stable across job retries.
         idempotencyKeyParts: {
           resource: {
             type: "account",
             id: "4e3ffeec-1426-4e54-ad28-83246f8f4e7c",
           },
         },
         // Set recipients at enqueue-time so they respect our notification provider's limits.
         recipients: ["userId-1"],

         workflowKey: WORKFLOW_KEYS.eventStartingReminder,

         // Any additional enqueue-time data passed to the job:
         workplaceId: "workplaceId-123",
       },
     );
   }

   // eslint-disable-next-line unicorn/prefer-top-level-await
   void enqueueNotificationJob();
   ```

   </embedex>

6. Create the NestJS service in the module's logic directory if it exists, else module root. Trigger the NotificationClient:

   <embedex source="packages/notifications/examples/exampleNotification.service.ts">

   ```ts
   import { type NotificationClient } from "@clipboard-health/notifications";

   import { type ExampleNotificationDo } from "./exampleNotification.constants";

   export class ExampleNotificationService {
     constructor(private readonly client: NotificationClient) {}

     async sendNotification(params: ExampleNotificationDo) {
       const { attempt, expiresAt, idempotencyKey, recipients, workflowKey, workplaceId } = params;

       // Assume this comes from a database and are used as template variables...
       // Use @clipboard-health/date-time's formatShortDateTime in your service for consistency.
       const data = { favoriteColor: "blue", favoriteAt: new Date().toISOString(), secret: "2" };

       // Important: Read the TypeDoc documentation for additional context.
       return await this.client.trigger({
         attempt,
         body: {
           data,
           recipients,
           workplaceId,
         },
         // Helpful when controlling notifications with feature flags.
         dryRun: false,
         expiresAt: new Date(expiresAt),
         idempotencyKey,
         keysToRedact: ["secret"],
         workflowKey,
       });
     }
   }
   ```

   </embedex>

## Local development commands

See [`package.json`](./package.json) `scripts` for a list of commands.
