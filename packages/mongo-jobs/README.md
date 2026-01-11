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

<embedex source="packages/mongo-jobs/examples/usage/myJob.ts">

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
      console.log(`Job ID: ${job._id.toString()}`);
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

#### Jobs with dependencies

If your job requires dependencies (like services, database connections, etc.) passed through the constructor, you must register an instance instead of the class:

<embedex source="packages/mongo-jobs/examples/usage/registerJobsWithDependencies.ts">

```ts
import { BackgroundJobs } from "@clipboard-health/mongo-jobs";

import { EmailServiceJob } from "./jobs/emailServiceJob";

const backgroundJobs = new BackgroundJobs();

// For jobs with constructor dependencies, register an instance
const emailService = {
  async send(to: string, subject: string, body: string) {
    console.log(`Sending email to ${to}: ${subject} : ${body}`);
  },
};

backgroundJobs.register(new EmailServiceJob(emailService), "notifications");
```

</embedex>

Example job with dependencies:

<embedex source="packages/mongo-jobs/examples/usage/jobs/emailServiceJob.ts">

```ts
import type { HandlerInterface } from "@clipboard-health/mongo-jobs";

interface EmailService {
  send(to: string, subject: string, body: string): Promise<void>;
}

export interface EmailServiceJobData {
  to: string;
  subject: string;
  body: string;
}

export class EmailServiceJob implements HandlerInterface<EmailServiceJobData> {
  public name = "EmailServiceJob";
  public maxAttempts = 3;

  constructor(private readonly emailService: EmailService) {}

  async perform({ to, subject, body }: EmailServiceJobData) {
    await this.emailService.send(to, subject, body);
  }
}
```

</embedex>

**Important**: When registering job instances, the library will use the instance directly rather than instantiating the class. This means:

- The same instance is used for all job executions in this process
- Dependencies are shared across all executions
- Your job class should be stateless (all state should come from the `data` parameter)

**Note**: Even when registering an instance, you can still enqueue jobs using the class, instance, or handler name:

```ts
// All of these work, regardless of whether you registered a class or instance
await backgroundJobs.enqueue(EmailServiceJob, data); // By class (type inferred)
await backgroundJobs.enqueue(emailServiceJobInstance, data); // By instance (type inferred)
await backgroundJobs.enqueue<EmailServiceJobData>("EmailServiceJob", data); // By name (explicit generic required)
```

The enqueued class/instance/name is only used to look up the registered handler. The **registered** instance is always used for execution, not the instance passed to `enqueue()`.

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
import type { ClientSession } from "mongodb";

import { backgroundJobs } from "./jobsRegistry";
import { MyJob } from "./myJob";

declare const mongoSession: ClientSession;

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
import type { MyJobData } from "./myJob";

// Enqueue by job name requires explicit generic for type safety
await backgroundJobs.enqueue<MyJobData>("MyJob", { userId: "123", action: "process" });
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
  lockTimeoutMS: 300_000,

  // Interval to check for stuck jobs, in ms (default: 60000 = 1 minute)
  unlockJobsIntervalMS: 30_000,

  // Interval to refresh queue list, in ms (default: 30000 = 30 seconds)
  refreshQueuesIntervalMS: 60_000,

  // Exclude specific queues from processing
  exclude: ["low-priority-queue"],
});
```

</embedex>

<embedex source="packages/mongo-jobs/examples/usage/stopWorker.ts">

```ts
import { backgroundJobs } from "./jobsRegistry";

// Graceful shutdown
await backgroundJobs.stop(30_000); // Wait up to 30 seconds for jobs to complete
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

#### Removing cron schedules

**Important**: When you register a cron schedule, it is persisted in the database. Even if you remove the schedule registration from your code, it will continue executing. To stop a cron schedule, you must explicitly remove it using the `removeCron` API:

```ts
await backgroundJobs.removeCron("daily-report");
```

This will:

- Delete the schedule from the database
- Cancel all pending jobs that were created by this schedule
- Prevent future jobs from being scheduled

### Job uniqueness

Prevent duplicate jobs from being enqueued or running simultaneously:

<embedex source="packages/mongo-jobs/examples/usage/uniqueSimple.ts">

```ts
import { ProcessUserJob } from "./jobs/processUserJob";
import { backgroundJobs } from "./jobsRegistry";

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

#### Advanced uniqueness

It's possible to have separate enqueued and running key. When the job is enqueued, the library will
ensure that we can't enqueue another one but once it starts running it switches to its running key so
we can enqueue another one that will wait to be executed until the first one finishes.

An example where this can be useful is recalculating some kind of a cache. We don't want to enqueue more
than one non-running job to not explode number of enqueued jobs. But once it starts running and there is another
trigger that may warrant cache recalculation we want to schedule another one to do another recalculation even
if there is one running, cause we don't know if the current recalculation will include the newest change.

<embedex source="packages/mongo-jobs/examples/usage/uniqueAdvanced.ts">

```ts
import { ProcessUserJob } from "./jobs/processUserJob";
import { backgroundJobs } from "./jobsRegistry";

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
import { SendEmailJob } from "./jobs/sendEmailJob";
import { backgroundJobs } from "./jobsRegistry";

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

## Observability

### Metrics

The library automatically reports metrics using StatsD by default. Metrics are reported every 60 seconds for each queue and include:

- **`background_jobs.queue.scheduled`** - Number of jobs scheduled for future execution
- **`background_jobs.queue.pending`** - Number of jobs ready to be processed
- **`background_jobs.queue.created`** - Total jobs (scheduled + pending)
- **`background_jobs.queue.failed`** - Number of jobs that exhausted all retry attempts
- **`background_jobs.queue.retry`** - Counter incremented when a job is retried
- **`background_jobs.queue.expired`** - Counter incremented when a job lock expires (stuck jobs)
- **`background_jobs.queue.delay`** - Timing metric for execution delay (time between `nextRunAt` and actual execution)

All metrics are tagged with `queue` to identify which queue the metric belongs to.

#### Custom metrics reporter

You can provide a custom metrics reporter by implementing the `MetricsReporter` interface:

```ts
import { BackgroundJobs, type MetricsReporter } from "@clipboard-health/mongo-jobs";

class CustomMetricsReporter implements MetricsReporter {
  gauge(name: string, value: number, tags: Record<string, string>): void {
    // Report gauge metric
    console.log(`Gauge: ${name} = ${value}`, tags);
  }

  increment(name: string, tags: Record<string, string>): void {
    // Report counter increment
    console.log(`Increment: ${name}`, tags);
  }

  timing(name: string, value: number | Date, tags: Record<string, string>): void {
    // Report timing metric
    console.log(`Timing: ${name} = ${value}`, tags);
  }
}

const backgroundJobs = new BackgroundJobs({
  metricsReporter: new CustomMetricsReporter(),
});
```

#### StatsD configuration

The default metrics reporter uses the `hot-shots` StatsD client. You can configure it by passing options:

```ts
import { BackgroundJobs, defaultMetricsReporter } from "@clipboard-health/mongo-jobs";

const backgroundJobs = new BackgroundJobs({
  metricsReporter: defaultMetricsReporter({
    host: "localhost",
    port: 8125,
    globalTags: { env: "production" },
  }),
});
```

### OpenTelemetry tracing

The library provides built-in OpenTelemetry distributed tracing support. Traces are automatically created for job enqueueing (producer) and execution (consumer), allowing you to track jobs across your distributed system.

#### Trace spans

Three types of spans are created:

1. **Producer spans** (`background-jobs.producer`) - Created when a job is enqueued
   - Kind: `PRODUCER`
   - Attributes include: messaging system, operation, destination (handler name), queue name

2. **Consumer spans** (`background-jobs.consumer`) - Created when a job is executed
   - Kind: `CONSUMER`
   - Linked to the producer span for distributed tracing
   - Attributes include: message ID, handler name, queue, attempt count, timestamps

3. **Internal spans** (`background-jobs.internals`) - Created for internal operations
   - Kind: `INTERNAL`
   - Used for operations like fetching jobs, reporting metrics, etc.

#### Setting up OpenTelemetry

To enable tracing, configure the OpenTelemetry SDK in your application:

```ts
import { NodeSDK } from "@opentelemetry/sdk-node";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";

const sdk = new NodeSDK({
  traceExporter: new OTLPTraceExporter({
    url: "http://localhost:4318/v1/traces",
  }),
  instrumentations: [getNodeAutoInstrumentations()],
});

sdk.start();
```

#### Distributed tracing

When a job is enqueued, trace context is automatically injected into the job data via the `_traceHeaders` field. When the job is executed, this context is extracted to link the consumer span to the producer span, enabling end-to-end trace visibility.

```text
HTTP Request → Enqueue Job (Producer Span)
                    ↓
              [Job in Queue]
                    ↓
              Execute Job (Consumer Span) → Your Handler
```

## License

MIT
