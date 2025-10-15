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
