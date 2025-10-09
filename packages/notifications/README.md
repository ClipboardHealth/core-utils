# @clipboard-health/notifications <!-- omit from toc -->

Send notifications through third-party providers.

## Table of contents <!-- omit from toc -->

- [Install](#install)
- [Usage](#usage)
- [Local development commands](#local-development-commands)

## Install

```bash
npm install @clipboard-health/notifications
```

## Usage

1. Export a `NotificationJobEnqueuer` instance:

   <embedex source="packages/notifications/examples/notificationJobEnqueuer.ts">

   ```ts
   import { NotificationJobEnqueuer } from "@clipboard-health/notifications";

   import { BackgroundJobsService } from "./setup";

   // Provide this in your microservice.
   export const notificationJobEnqueuer = new NotificationJobEnqueuer({
     adapter: new BackgroundJobsService(),
   });
   ```

   </embedex>

1. Enqueue your job:

   <embedex source="packages/notifications/examples/enqueueNotificationJob.ts">

   ```ts
   import { IdempotencyKey } from "@clipboard-health/notifications";

   import { ExampleNotificationJob } from "./exampleNotification.job";
   import { notificationJobEnqueuer } from "./notificationJobEnqueuer";

   async function enqueueNotificationJob() {
     await notificationJobEnqueuer.enqueueOneOrMore(ExampleNotificationJob, {
       // Set expiresAt at enqueue-time so it remains stable across job retries.
       expiresAt: minutesFromNow(60),
       // Set idempotencyKey at enqueue-time so it remains stable across job retries.
       idempotencyKey: new IdempotencyKey({
         resourceId: "event-123",
       }),
       // Set recipients at enqueue-time so they respect our notification provider's limits.
       recipients: ["user-1"],

       workflowKey: "event-starting-reminder",

       // Any additional enqueue-time data passed to the job:
       workplaceId: "workplace-123",
     });
   }

   // eslint-disable-next-line unicorn/prefer-top-level-await
   void enqueueNotificationJob();

   function minutesFromNow(minutes: number) {
     return new Date(Date.now() + minutes * 60_000);
   }
   ```

   </embedex>

1. Implement your job, which should be minimal, calling off to a service to send the actual notification:

   <embedex source="packages/notifications/examples/exampleNotification.job.ts">

   ```ts
   import { type BaseHandler } from "@clipboard-health/background-jobs-adapter";
   import {
     errorsInResult,
     type NotificationEnqueueData,
     type NotificationJobData,
     RETRYABLE_ERRORS,
   } from "@clipboard-health/notifications";
   import { toError } from "@clipboard-health/util-ts";

   import { type ExampleNotificationService } from "./exampleNotification.service";

   interface ExampleNotificationData {
     workplaceId: string;
   }

   export type ExampleNotificationEnqueueData = NotificationEnqueueData & ExampleNotificationData;
   export type ExampleNotificationJobData = NotificationJobData & ExampleNotificationData;

   export class ExampleNotificationJob implements BaseHandler<ExampleNotificationJobData> {
     constructor(private readonly service: ExampleNotificationService) {}

     async perform(data: ExampleNotificationJobData, job: { attemptsCount: number }) {
       const result = await this.service.sendNotification({
         ...data,
         // Include the job's attempts count for debugging, this is called `retryAttempts` in `background-jobs-postgres`.
         attempt: job.attemptsCount + 1,
       });

       if (errorsInResult(result, RETRYABLE_ERRORS)) {
         throw toError(result.error);
       }
     }
   }
   ```

   </embedex>

1. Trigger the job in your service:

   <embedex source="packages/notifications/examples/exampleNotification.service.ts">

   ```ts
   import { type NotificationClient } from "@clipboard-health/notifications";

   import { type ExampleNotificationJobData } from "./exampleNotification.job";

   type ExampleNotificationDo = ExampleNotificationJobData & { attempt: number };

   export class ExampleNotificationService {
     constructor(private readonly client: NotificationClient) {}

     async sendNotification(params: ExampleNotificationDo) {
       const { attempt, expiresAt, idempotencyKey, recipients, workflowKey, workplaceId } = params;

       // Assume this comes from a database and, for example, are used as template variables...
       const data = { favoriteColor: "blue", secret: "2" };

       return await this.client.trigger({
         attempt,
         body: {
           recipients,
           data,
           workplaceId,
         },
         expiresAt,
         idempotencyKey,
         key: workflowKey,
         keysToRedact: ["secret"],
         workflowKey,
       });
     }
   }
   ```

   </embedex>

## Local development commands

See [`package.json`](./package.json) `scripts` for a list of commands.
