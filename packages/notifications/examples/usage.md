// embedex: packages/ai-rules/.ruler/backend/notifications.md,packages/notifications/README.md

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

1. Implement a minimal job, calling off to a NestJS service for any business logic and to send the notification.

   <embedex source="packages/notifications/examples/exampleNotification.job.ts">

   ```ts
   import { type BaseHandler } from "@clipboard-health/background-jobs-adapter";
   import { type NotificationData } from "@clipboard-health/notifications";
   import { isFailure, toError } from "@clipboard-health/util-ts";

   import { type ExampleNotificationService } from "./exampleNotification.service";

   export type ExampleNotificationData = NotificationData<{
     workplaceId: string;
   }>;

   export const EXAMPLE_NOTIFICATION_JOB_NAME = "ExampleNotificationJob";

   // For mongo-jobs, you'll implement HandlerInterface<ExampleNotificationData["Job"]>
   // For background-jobs-postgres, you'll implement Handler<ExampleNotificationData["Job"]>
   export class ExampleNotificationJob implements BaseHandler<ExampleNotificationData["Job"]> {
     public name = EXAMPLE_NOTIFICATION_JOB_NAME;

     constructor(private readonly service: ExampleNotificationService) {}

     async perform(data: ExampleNotificationData["Job"], job: { attemptsCount: number }) {
       const result = await this.service.sendNotification({
         ...data,
         // Include the job's attempts count for debugging, this is called `retryAttempts` in `background-jobs-postgres`.
         attempt: job.attemptsCount + 1,
       });

       if (isFailure(result)) {
         throw toError(result.error);
       }
     }
   }
   ```

   </embedex>

1. Search your service for a constant that stores workflow keys. If there isn't one, create and export it:

   <embedex source="packages/notifications/examples/workflowKeys.ts">

   ```ts
   export const WORKFLOW_KEYS = {
     eventStartingReminder: "event-starting-reminder",
   } as const;
   ```

   </embedex>

1. Enqueue your job:

   <embedex source="packages/notifications/examples/enqueueNotificationJob.ts">

   ```ts
   import {
     EXAMPLE_NOTIFICATION_JOB_NAME,
     type ExampleNotificationData,
   } from "./exampleNotification.job";
   import { notificationJobEnqueuer } from "./notificationJobEnqueuer";
   import { WORKFLOW_KEYS } from "./workflowKeys";

   async function enqueueNotificationJob() {
     await notificationJobEnqueuer.enqueueOneOrMore<ExampleNotificationData["Enqueue"]>(
       EXAMPLE_NOTIFICATION_JOB_NAME,
       // Important: Read the TypeDoc documentation for additional context.
       {
         /**
          * Set expiresAt at enqueue-time so it remains stable across job retries. Use date-fns in your
          * service instead of this manual calculation.
          */
         expiresAt: new Date(Date.now() + 60 * 60_000).toISOString(),
         // Set idempotencyKey at enqueue-time so it remains stable across job retries.
         idempotencyKey: {
           resourceId: "event-123",
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

1. Trigger the job in your NestJS service:

   <embedex source="packages/notifications/examples/exampleNotification.service.ts">

   ```ts
   import { type NotificationClient } from "@clipboard-health/notifications";

   import { type ExampleNotificationData } from "./exampleNotification.job";

   type ExampleNotificationDo = ExampleNotificationData["Job"] & { attempt: number };

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
         expiresAt: new Date(expiresAt),
         idempotencyKey,
         keysToRedact: ["secret"],
         workflowKey,
       });
     }
   }
   ```

   </embedex>
