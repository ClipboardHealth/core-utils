# @clipboard-health/notifications <!-- omit from toc -->

Send notifications through third-party providers.

## Table of contents <!-- omit from toc -->

- [Local development commands](#local-development-commands)

<embedex source="packages/notifications/examples/usage.md">

1. Search your service for a `NotificationJobEnqueuer` instance. If there isn't one, create and export it:

   ```ts
   import { NotificationJobEnqueuer } from "@clipboard-health/notifications";

   import { BackgroundJobsService } from "./setup";

   // Create and export one instance of this in your microservice.
   export const notificationJobEnqueuer = new NotificationJobEnqueuer({
     // Use your instance of `@clipboard-health/mongo-jobs` or `@clipboard-health/background-jobs-postgres` here.
     adapter: new BackgroundJobsService(),
   });
   ```

2. Add types and the job name to the module's logic directory if it exists, else module root. You MUST create and use the `...DataJob` and `...DataEnqueue` types:

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

3. Implement a minimal job in the module's logic/job directory if it exists, else module root. The job calls off to a NestJS service for any business logic and to send the notification:

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

4. Search the service for a constant that stores workflow keys. If there isn't one, create and export it. You MUST insert the key in alphabetical order:

   ```ts
   export const WORKFLOW_KEYS = {
     eventStartingReminder: "event-starting-reminder",
   } as const;
   ```

5. Enqueue the job:

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

6. Create the NestJS service in the module's logic directory if it exists, else module root. Trigger the NotificationClient:

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

## Simplified Pattern with `triggerChunked`

An alternative simplified pattern using `triggerChunked` stores the full serializable request at enqueue time, eliminating issues with stale data and idempotency key conflicts that can occur when looking up fresh data at job execution time.

Key benefits:

- Data immutability: Request is captured at enqueue time
- Automatic chunking: Recipients are split into chunks internally
- Idempotency: Uses `${jobId}-${chunkNumber}` as idempotency keys
- Safe retries: Idempotency protects against duplicates on retry

1. Define the job data type:

   ```ts
   export const TRIGGER_NOTIFICATION_JOB_NAME = "TriggerNotificationJob";
   ```

2. Implement the job using `triggerChunked`:

   ```ts
   import { type BaseHandler } from "@clipboard-health/background-jobs-adapter";
   import {
     type NotificationClient,
     type SerializableTriggerRequest,
   } from "@clipboard-health/notifications";
   import { isFailure } from "@clipboard-health/util-ts";

   import { CBHLogger } from "./setup";
   import { TRIGGER_NOTIFICATION_JOB_NAME } from "./triggerNotification.constants";

   /**
    * For mongo-jobs, implement HandlerInterface<SerializableTriggerRequest>.
    * For background-jobs-postgres, implement Handler<SerializableTriggerRequest>.
    */
   export class TriggerNotificationJob implements BaseHandler<SerializableTriggerRequest> {
     public name = TRIGGER_NOTIFICATION_JOB_NAME;
     private readonly logger = new CBHLogger({
       defaultMeta: {
         logContext: TRIGGER_NOTIFICATION_JOB_NAME,
       },
     });

     public constructor(private readonly client: NotificationClient) {}

     public async perform(
       data: SerializableTriggerRequest,
       job: { _id: string; attemptsCount: number; uniqueKey?: string },
     ) {
       const metadata = {
         attempt: job.attemptsCount + 1,
         jobId: job._id,
         workflowKey: data.workflowKey,
       };
       this.logger.info("Processing", metadata);

       try {
         const result = await this.client.triggerChunked({
           ...data,
           attempt: metadata.attempt,
           idempotencyKey: job.uniqueKey ?? metadata.jobId,
         });

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

3. Enqueue the job with all data captured at enqueue time:

   ```ts
   import { type BackgroundJobsAdapter } from "@clipboard-health/background-jobs-adapter";
   import { type SerializableTriggerRequest } from "@clipboard-health/notifications";

   import { BackgroundJobsService } from "./setup";
   import { TRIGGER_NOTIFICATION_JOB_NAME } from "./triggerNotification.constants";
   import { WORKFLOW_KEYS } from "./workflowKeys";

   /**
    * Enqueue a notification job. Pass the full trigger request at enqueue time. It is immutable once
    * enqueued, eliminating issues with stale data and idempotency key conflicts that can occur when
    * looking up fresh data at job execution time.
    */
   async function enqueueExampleNotificationJob(adapter: BackgroundJobsAdapter) {
     const data: SerializableTriggerRequest = {
       // Important: Read the TypeDoc documentation for additional context.
       body: {
         recipients: ["userId-1", "userId-2"],
         data: { favoriteColor: "blue" },
       },
       /*
        * Set expiresAt at enqueue-time so it remains stable across job retries. Use date-fns in your
        * service instead of this manual calculation.
        */
       expiresAt: new Date(Date.now() + 60 * 60_000).toISOString(),
       // Keys to redact from logs
       keysToRedact: ["secret"],
       workflowKey: WORKFLOW_KEYS.eventStartingReminder,
     };

     // Option 1: Use background job ID as idempotency key (most common).
     await adapter.enqueue(TRIGGER_NOTIFICATION_JOB_NAME, data);

     // Option 2: Provide your own idempotency key for background job and notification deduplication.
     await adapter.enqueue(TRIGGER_NOTIFICATION_JOB_NAME, data, {
       idempotencyKey: `meeting-123-reminder`,
     });
   }

   // eslint-disable-next-line unicorn/prefer-top-level-await
   void enqueueExampleNotificationJob(new BackgroundJobsService());

   // 1. Search your service for `triggerNotification.job.ts` and `triggerNotification.service.ts`. If they don't exist, create them:
   // 2. Search the service for a constant that stores workflow keys. If there isn't one, create and export it. You MUST insert the key in alphabetical order:
   // 3. Build your `SerializableTriggerRequest` and enqueue your job. Enqueue your job in the same database transaction as the changes it's notifying about:
   ```

</embedex>

## Local development commands

See [`package.json`](./package.json) `scripts` for a list of commands.
