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

Create a `MongoJobs` instance and register your handlers to groups:

<embedex source="packages/mongo-jobs/examples/quickstart/jobsRegistry.ts">

```ts
import { MongoJobs } from "@clipboard-health/mongo-jobs";

import { WelcomeEmailJob } from "./welcomeEmailJob";

const backgroundJobs = new MongoJobs();

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

## License

MIT
