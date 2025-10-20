# @clipboard-health/mongo-jobs

> A robust, MongoDB-backed background job processing library for Node.js with TypeScript support

## Features

- **Reliable job processing** - Built on MongoDB for persistent, reliable job storage
- **Automatic retries** - Exponential backoff with configurable max attempts
- **Delayed jobs** - Schedule jobs to run at specific times
- **Unique jobs** - Ensure only one instance of a job is enqueued or running
- **Cron scheduling** - Built-in support for recurring jobs with cron expressions
- **Job groups** - Organize jobs into groups and run dedicated workers per group
- **Transaction support** - Enqueue jobs atomically with MongoDB sessions
- **Type-safe** - Full TypeScript support with strongly-typed job payloads
- **Concurrency control** - Configure worker concurrency per group
- **Observability** - Built-in metrics reporting and logging support

## Installation

```bash
npm install @clipboard-health/mongo-jobs
```

## Quick Start

### 1. Define a job handler

Job handlers implement the `HandlerInterface` and define how your jobs are processed:

<embedex source="packages/mongo-jobs/examples/quickstart/welcomeEmailJob.ts">

```ts
import type { HandlerInterface } from "@clipboard-health/mongo-jobs";

export interface WelcomeEmailData {
  userId: string;
  email: string;
}

export class WelcomeEmailJob implements HandlerInterface<WelcomeEmailData> {
  public name = "WelcomeEmailJob";
  public maxAttempts = 3;

  async perform({ userId, email }: WelcomeEmailData) {
    await this.sendEmail(email, `Welcome, user ${userId}!`);
  }

  private async sendEmail(_to: string, _message: string) {
    // Email sending logic
  }
}
```

</embedex>

### 2. Create a service and register handlers

Create a `BackgroundJobs` instance and register your handlers to groups:

<embedex source="packages/mongo-jobs/examples/quickstart/jobsRegistry.ts">

```ts
import { BackgroundJobs } from "@clipboard-health/mongo-jobs";

import { WelcomeEmailJob } from "./welcomeEmailJob";

const backgroundJobs = new BackgroundJobs();

backgroundJobs.register(WelcomeEmailJob, "emails");

export { backgroundJobs };
```

</embedex>

### 3. Enqueue jobs

Add jobs to the queue to be processed:

<embedex source="packages/mongo-jobs/examples/quickstart/enqueueJob.ts">

```ts
import { backgroundJobs } from "./jobsRegistry";
import { WelcomeEmailJob } from "./welcomeEmailJob";

await backgroundJobs.enqueue(WelcomeEmailJob, {
  userId: "123",
  email: "user@example.com",
});
```

</embedex>

### 4. Start the worker

Start processing jobs from the queue:

<embedex source="packages/mongo-jobs/examples/quickstart/startWorker.ts">

```ts
import { backgroundJobs } from "./jobsRegistry";

await backgroundJobs.start(["emails"], {
  maxConcurrency: 10,
});
```

</embedex>

## Usage

### Creating a job

Jobs are defined as classes that implement the `HandlerInterface`:

<embedex source="packages/mongo-jobs/examples/usage/createJob.ts">

```ts
import type { BackgroundJobType, HandlerInterface } from "@clipboard-health/mongo-jobs";

export interface MyJobData {
  userId: string;
  action: string;
}

export class MyJob implements HandlerInterface<MyJobData> {
  // Required: unique name for this job type
  public name = "MyJob";

  // Optional: max retry attempts (default: 10)
  public maxAttempts = 5;

  // Required: the actual job logic
  async perform(data: MyJobData, job?: BackgroundJobType<MyJobData>) {
    // Job implementation
    console.log(`Processing ${data.action} for user ${data.userId}`);

    // Optional: access job metadata
    if (job) {
      console.log(`Job ID: ${job._id}`);
      console.log(`Attempt: ${job.attemptsCount}`);
    }
  }
}
```

</embedex>

#### Job handler options

- **`name`** (required): Unique identifier for the job type
- **`maxAttempts`** (optional): Maximum number of retry attempts before marking the job as failed. Default is 10. Uses exponential backoff: 2^attempt seconds between retries
- **`perform`** (required): Async function that executes the job logic
  - `data`: The job payload passed when enqueueing
  - `job`: Optional metadata about the job execution (id, attempts, timestamps, etc.)

### Registering jobs

Register job handlers with the `BackgroundJobs` instance and assign them to processing groups:

<embedex source="packages/mongo-jobs/examples/usage/registerJobs.ts">

```ts
import { BackgroundJobs } from "@clipboard-health/mongo-jobs";

import { CleanupJob } from "./jobs/cleanupJob";
import { EmailJob } from "./jobs/emailJob";
import { ReportJob } from "./jobs/reportJob";
import { SmsJob } from "./jobs/smsJob";

const backgroundJobs = new BackgroundJobs();

// Register jobs to groups
backgroundJobs.register(EmailJob, "notifications");
backgroundJobs.register(ReportJob, "reports");
backgroundJobs.register(CleanupJob, "maintenance");

// You can register multiple jobs to the same group
backgroundJobs.register(SmsJob, "notifications");
```

</embedex>

Groups allow you to:
- Organize related jobs together
- Run dedicated workers for specific job types
- Control concurrency per group
- Scale different job types independently

### Enqueuing jobs

Add jobs to the queue for processing:

<embedex source="packages/mongo-jobs/examples/usage/enqueueBasic.ts">

```ts
import { backgroundJobs } from "./jobsRegistry";
import { MyJob } from "./myJob";

// Basic enqueue
await backgroundJobs.enqueue(MyJob, {
  userId: "123",
  action: "process",
});
```

</embedex>

<embedex source="packages/mongo-jobs/examples/usage/enqueueWithOptions.ts">

```ts
import { backgroundJobs } from "./jobsRegistry";
import { MyJob } from "./myJob";

// Enqueue with options
await backgroundJobs.enqueue(
  MyJob,
  { userId: "123", action: "process" },
  {
    // Schedule for later
    startAt: new Date("2024-12-31T23:59:59Z"),

    // Ensure uniqueness (see uniqueness section below)
    unique: "user-123-process",

    // Use within a MongoDB transaction
    session: mongoSession,
  },
);
```

</embedex>

<embedex source="packages/mongo-jobs/examples/usage/enqueueByName.ts">

```ts
import { backgroundJobs } from "./jobsRegistry";

// Enqueue by job name (when handler is already registered)
await backgroundJobs.enqueue("MyJob", { userId: "123", action: "process" });
```

</embedex>

#### Enqueue options

- **`startAt`**: Schedule the job to run at a specific time. Default is immediate
- **`unique`**: Ensure only one instance of the job exists (see Job uniqueness section)
- **`session`**: MongoDB session for transactional job creation

### Starting a worker

Start processing jobs from one or more groups:

<embedex source="packages/mongo-jobs/examples/usage/startWorkerBasic.ts">

```ts
import { backgroundJobs } from "./jobsRegistry";

// Start a worker for specific groups
await backgroundJobs.start(["notifications", "reports"], {
  maxConcurrency: 20,
});
```

</embedex>

<embedex source="packages/mongo-jobs/examples/usage/startWorkerWithOptions.ts">

```ts
import { backgroundJobs } from "./jobsRegistry";

// Start with all available options
await backgroundJobs.start(["notifications"], {
  // Maximum concurrent jobs (default: 10)
  maxConcurrency: 10,

  // Time to wait when no jobs available, in ms (default: 10000)
  newJobCheckWaitMS: 5000,

  // Use MongoDB change streams for instant job detection (default: true)
  useChangeStream: true,

  // Lock timeout for stuck jobs, in ms (default: 600000 = 10 minutes)
  lockTimeoutMS: 300000,

  // Interval to check for stuck jobs, in ms (default: 60000 = 1 minute)
  unlockJobsIntervalMS: 30000,

  // Interval to refresh queue list, in ms (default: 30000 = 30 seconds)
  refreshQueuesIntervalMS: 60000,

  // Exclude specific queues from processing
  exclude: ["low-priority-queue"],
});
```

</embedex>

<embedex source="packages/mongo-jobs/examples/usage/stopWorker.ts">

```ts
import { backgroundJobs } from "./jobsRegistry";

// Graceful shutdown
await backgroundJobs.stop(30000); // Wait up to 30 seconds for jobs to complete
```

</embedex>

#### Worker options

- **`maxConcurrency`**: Number of jobs to process simultaneously
- **`useChangeStream`**: Enable instant job detection using MongoDB change streams. When `true`, workers are notified immediately when new jobs are added
- **`newJobCheckWaitMS`**: Fallback polling interval when no jobs are available
- **`lockTimeoutMS`**: Maximum time a job can be locked before being considered stuck
- **`unlockJobsIntervalMS`**: How often to check for and unlock stuck jobs
- **`refreshQueuesIntervalMS`**: How often to refresh the list of queues to consume
- **`exclude`**: Array of queue names to skip processing

### Cron jobs

Schedule recurring jobs using cron expressions:

<embedex source="packages/mongo-jobs/examples/usage/cronRegister.ts">

```ts
import { BackgroundJobs } from "@clipboard-health/mongo-jobs";

import { DailyReportJob } from "./jobs/dailyReportJob";

const backgroundJobs = new BackgroundJobs();

// Register a cron job
await backgroundJobs.registerCron(DailyReportJob, {
  // Group assignment (same as regular registration)
  group: "reports",

  // Unique name for this schedule
  scheduleName: "daily-report",

  // Cron expression (standard 5-field format)
  cronExpression: "0 9 * * *", // Every day at 9 AM

  // Optional: timezone for cron evaluation (default: "utc")
  timeZone: "America/New_York",

  // Data to pass to each job execution
  data: { reportType: "daily" },
});
```

</embedex>

<embedex source="packages/mongo-jobs/examples/usage/cronRemove.ts">

```ts
import { backgroundJobs } from "./jobsRegistry";

// Remove a cron schedule and its pending jobs
await backgroundJobs.removeCron("daily-report");
```

</embedex>

#### Cron scheduling details

- Uses standard 5-field cron expressions: `minute hour day month weekday`
- Automatically enqueues the next job after the current one completes
- Updates to cron schedules automatically cancel pending jobs and reschedule
- Failed cron jobs are retried according to `maxAttempts`, but the next scheduled job will still be enqueued
- Each scheduled execution is a unique job instance

### Job uniqueness

Prevent duplicate jobs from being enqueued or running simultaneously:

<embedex source="packages/mongo-jobs/examples/usage/uniqueSimple.ts">

```ts
import { backgroundJobs } from "./jobsRegistry";
import { ProcessUserJob } from "./jobs/processUserJob";

// Simple uniqueness - single unique key for both enqueued and running
await backgroundJobs.enqueue(
  ProcessUserJob,
  { userId: "123" },
  {
    unique: "process-user-123",
  },
);
```

</embedex>

<embedex source="packages/mongo-jobs/examples/usage/uniqueAdvanced.ts">

```ts
import { backgroundJobs } from "./jobsRegistry";
import { ProcessUserJob } from "./jobs/processUserJob";

// Advanced uniqueness - separate keys for enqueued vs running states
await backgroundJobs.enqueue(
  ProcessUserJob,
  { userId: "123" },
  {
    unique: {
      // Only one enqueued job per user
      enqueuedKey: "process-user-123",

      // Only one running job per user
      runningKey: "process-user-123-running",
    },
  },
);
```

</embedex>

<embedex source="packages/mongo-jobs/examples/usage/uniqueMultipleEnqueued.ts">

```ts
import { backgroundJobs } from "./jobsRegistry";
import { SendEmailJob } from "./jobs/sendEmailJob";

// Example: Allow multiple enqueued but only one running
await backgroundJobs.enqueue(
  SendEmailJob,
  { userId: "123", emailType: "welcome" },
  {
    unique: {
      enqueuedKey: undefined, // Allow multiple enqueued emails
      runningKey: "send-email-123", // But only one sending at a time
    },
  },
);
```

</embedex>

#### Uniqueness behavior

- **Enqueued uniqueness**: Prevents duplicate jobs from being added to the queue. If a job with the same `enqueuedKey` already exists and hasn't started, the new enqueue returns `undefined`
- **Running uniqueness**: When a job starts, its unique key transitions from `enqueuedKey` to `runningKey`. This prevents multiple instances from running simultaneously
- If a duplicate unique key is detected, the operation silently fails and returns `undefined`
- Uniqueness is enforced via MongoDB unique index on the `uniqueKey` field
- Cron jobs automatically use unique keys based on schedule name and timestamp

## License

MIT
