# @clipboard-health/mongo-jobs

Background Jobs library for MongoDB.

## Table of contents <!-- omit from toc -->

- [Upgrade to v11](#upgrade-to-v11)
- [Install](#install)
- [Usage](#usage)
  - [Job handler](#job-handler)
  - [Creating jobs registry](#creating-jobs-registry)
  - [Enqueueing jobs](#enqueueing-jobs)
    - [Unique jobs](#unique-jobs)
  - [Cron Jobs](#cron-jobs)
    - [Registering cron schedules](#registering-cron-schedules)
    - [Removing cron schedules](#removing-cron-schedules)
    - [Updating cron schedules](#updating-cron-schedules)
    - [Caveats](#caveats)
  - [Starting the worker](#starting-the-worker)
  - [NestJS integration](#nestjs-integration)
    - [NestJS caveats](#nestjs-caveats)
- [Design decisions](#design-decisions)
  - [Jobs Registry Design](#jobs-registry)
  - [Worker Design](#worker-design)
  - [Cron Design](#cron-design)
- [Local development commands](#local-development-commands)

## Upgrade to v11

In version 11 we changed how traces are being gathered from using dd-trace to use more generic @opentelemetry/api.
In order to retain tracing functionality with datadog you need to add register dd-trace tracer as opentelemetry provider.
To do that, in the file where you initialize dd-trace you need to add

```ts
const provider = new tracer.TracerProvider();
provider.register();
```

## Install

```bash
npm install @clipboard-health/mongo-jobs
```

## Usage

### Job handler

The job handler is responsible for establishing an interface for how to publish jobs and also how to handle them.

An example job handler may look like:

```typescript
import type { HandlerInterface, BackgroundJobType } from "@clipboard-health/mongo-jobs";
import mongoose from "mongoose";
import { Shift } from "./models/shift";
import { logger } from "./logger";

// This interface defines the job payload.
// It ensures that both publishers and consumers are in sync.
interface ShiftStartReminderData {
  shiftId: string;
}

class ShiftStartReminderJob implements HandlerInterface<ShiftStartReminderData> {
  // Name of the handler. We need it so that we can store the name of the
  // handler in the db when scheduling the job and then match the handler's name to the
  // implementation when the job is being picked up by the worker.
  public name = "ShiftStartReminderJob";

  // Set max attempts for this particular job handler.
  // When job fails (there is an exception raised when performing the job)
  // the job will be automatically retried with exponential backoff where
  // back off time will be (2 ^ made attempts count) seconds
  // (so after first attempt it will be 2 seconds, then 4 then 8 etc)
  // This field is optional, default max attempts is 10
  public maxAttempts = 5;

  // This method is called once the job is picked up by the worker
  // First parameter is the data passed to the job. The second parameter is optional and it contains the entire
  // job object.
  public async perform(
    { shiftId }: ShiftStartReminderData,
    job: BackgroundJobType<ShiftStartReminderData>,
  ) {
    logger.info(`Starting job ${job._id}`);
    const shift = await Shift.findById(new mongoose.Types.ObjectId(shiftId));

    // get the shift from the database
    const shift = await db.getShift(data.shiftId);

    // if shift is not found, we skip the job.
    // the job is marked as "done" and won't be retried
    if (!shift) {
      logger.info(`skipping job, shift not found: ${shiftId}`);
      return;
    }

    // skip the job if the shift doesn't have enough data to send the reminder
    if (shift.isCancelled || shift.workerPhoneNumber === null) {
      logger.info(`skipping job, invalid shift state: ${shiftId}`);
      return;
    }

    try {
      // send the reminder
      const response = await this.sendReminder(shift.workerPhoneNumber);

      // throw an error if the reminder couldn't be sent
      // any errors thrown within the `perform` function will retry the whole job
      if (!response.success) throw response.error;
    } catch (err: unknown) {
      // skips the job if the error is known and we don't want to retry
      if (err instanceof SomeKnownException) {
        logger.info(`skipping job, known error: ${err.message}`);
        return;
      }

      // rethrows the error if it's unknown
      throw err;
    }
  }

  sendReminder(phone: string) {
    //...
  }
}
```

### Creating jobs registry

In order to use background jobs, first we need to keep a registry of jobs/job handlers that we have in the system

```typescript
import { BackgroundJobsService } from "@clipboard-health/mongo-jobs";
import { ShiftStartReminderJob } from "./jobs/shift-start-reminder";

const backgroundJobs = new BackgroundJobsService(
    {
        // You can pass a db connection if you are app is not using mongoose's default connection
        dbConnection: connection

        // You can pass a logger to be used by background jobs
        logger: myLogger

        // StatsD-like metrics reporter
        metricsReporter: myMetricsReporter

        // For test scenarios you may want to allow handler overriding if your
        // test setup re-register handlers on the same instance of the service.
        // Default: false.
        allowHandlerOverride: true
    }
);
// We are registering ShiftStartReminderJob. It will be run in "notifications" group
backgroundJobs.register(ShiftStartReminderJob, "notifications");
export { backgroundJobs };
```

### Enqueueing jobs

To enqueue jobs you call `enqueue` on the registry that you created with following arguments

- which job (handler) you want to enqueue
- data that you want to pass to the handler
- options (optional argument)
  - startAt - when should the job be executed. Default is now.
  - session - in case you want to enqueue a job inside of transaction then you can pass mongo's session
  - unique - options to make the job unique when you want to make sure that only 1 instance of the job will be enqueued/running at any given time.
    More about this feature [below](#unique-jobs)

```typescript
import { backgroundJobs } from "./background-jobs-registry";
import { ShiftStartReminderJob } from "./jobs/shift-start-reminder";

class MyService {
  async createShift({ shiftDto }) {
    // Start a database sessions (that's how you do transactions in mongo),  so
    // we atomically create the shift and the job. Passing a session is not mandatory when
    // scheduling a job, but is a good practice
    const dbSession = await mongoose.startSession();
    dbSession.startTransaction();

    const newShift = await Shift.create(shiftDto);
    // schedule the job a minute after the job was created
    await backgroundJobs.enqueue(
      ShiftStartReminderJob,
      { shiftId: newShift._id.toString() },
      {
        startAt: new Date(Date.now() + 60000),
        session: dbSession,
        unique: `shift-start-reminder-${newShift._id.toString()}`,
      },
    );

    await dbSession.commitTransaction();
    await dbSession.endSession();

    return newShift;
  }
}
```

#### Unique jobs

##### Simple scenario

In case you need to make sure that only 1 instance of particular job is enqueued then you can use the `unique` option when enqueuing the job.
The simplest way of doing that is just passing a string key to uniq option which will be the uniqueness key for this job.

```
backgroundJobs.enqueue(MyJob, { data }, { unique: `my-job-${shiftId}` })
```

We are putting a `shiftId` in the key cause here we want to only limit the uniqueness to jobs that would be scheduled for particular shift but we want
to be able to enqueue `MyJob` job for other shifts at the same time.

What it does is to make sure that only 1 job with `my-job-${shiftId}` key can exist in the database at a time. So when you enqueue a job like that you won't be
able to enqueue another one with same key until this job successfully finishes (at which point it is removed from the DB) or reaches the max number of attempts and
is marked as failed. Note: If some code enqueue a job with same unique key, `enqueue` method won't throw error but return undefined.

##### Advanced options

There may be situations where you may want to have only 1 job enqueued, but as soon as it starts running you may need to be able to enqueue another one.
You can use advanced unique options then:

```
backgroundJobs.enqueue(
  MyJob,
  { data },
  {
    unique: {
      enqueuedKey: "my-job-${shiftId}-enqueued",
      runningKey: "my-job-${shiftId}-running"
    }
  }
)
```

What it does is:

- When the job is being enqueued it is created with the `uniqueKey` the value of `enqueuedKey`
- When the worker picks up the job for the first time it updates the `uniqueKey` of the job to the value of `runningKey`
  - If there is `uniqueKey` conflict when updating the value to that from `runningKey` (which means that there is another instance of this job already running)
    then the job will be deferred for 5 seconds.
- If the value of some key is set to undefined then it means that you don't want to enforce uniqueness in that stage.

_When would I want to use that?_

An example scenario would be updating the cache of shifts count for given facility. When you create a new shift for given facility you schedule a job to count all
shifts in given facility and update the facility record with the count. You probably don't want to schedule that job for each shift that you create, because in case you
create a lot of shifts in quick succession then you would have a lot of jobs that were not picked up by jobs worker yet and they all will end up calculating the same value.
So you would schedule the job with unique key `calculate-shift-count-${facilityId}`. There is one problem there, though. If you create another shift while the job is already running
then it is possible that the job has actually calculated number of shifts in the facility and is updating the facility record at the moment. So you would end up with n-1 value in the cache.
Therefore as soon as the job starts you would want to have another one enqueued to make sure that in the end your cache value reflects reality.

##### Uniqueness Caveats and Best Practices

Keep in mind that uniqueness of the job is guaranteed only as long as the job is present in the DB. The library removes the jobs after completion
to keep the collection as slim as possible. Therefore if your use case requires the action to be perpetually unique - like sending particular notification only once -
then this has to be done in application logic. For a scenario where you send notification about a shift

- Have a field on the shift that would store that a notification was sent or preferably when notification was sent
- Whenever you get a trigger that would cause the notification to be sent - first check whether this field is present and if
  so, don't enqueue the job.
- When enqueuing the job, use the uniqueness property so that you make sure that only one job is enqueued at a time.
- At the end of the job, update your shift with proper value that the notification was sent.

### Cron Jobs

The library supports cron-like jobs scheduling.

#### Registering cron schedules

```
await backgroundJobs.registerCron(MyJob {
  group: "default", // which group should the job be added to
  cronExpression: "20 * * * *",
  scheduleName: "my-job-cron", // Name of the schedule
  data: { someData: 123 } // Data passed to the job handler
});
```

You can have register multiple schedules for the same handler possibly with
different data and groups:

```
await backgroundJobs.registerCron(MyJob {
  group: "cron-jobs-1",
  cronExpression: "20 * * * *",
  scheduleName: "my-job-cron-1", // Name of the schedule
  data: { someData: 123 } // Data passed to the job handler
});

await backgroundJobs.registerCron(MyJob {
  group: "cron-jobs-2",
  cronExpression: "50 * * * *",
  scheduleName: "my-job-cron-2", // Name of the schedule
  data: { someData: 666 } // Data passed to the job handler
});
```

Keep in mind that if you register the job handler as an instance then
the first instance that makes it into background jobs service will
be used throughout all crons.

```
await backgroundJobs.registerCron(new MyJob({config: 1}) ...
await backgroundJobs.registerCron(new MyJob({config: 2}) ...

// All jobs for MyJob handler will use the new MyJob({config: 1}) handler
```

#### Removing cron schedules

When you register a cron schedule then it is created in the DB. Even if you remove it from code
it will keep executing. In order to remove cron schedule you need to use remove api

```
  await backgroundJobs.removeCron("my-schedule-name")
```

#### Updating cron schedules

As mentioned before cron schedules are kept in the database. So when you run a new release of your service
that calls `registerCron` then it would create the schedule or if one with given name already exists then it will
update the existing one

#### Caveats

The main purpose of the library is to schedule jobs following the cron expression. But it does not synchronize
executions of those jobs. So if you have a job that takes 20 minutes to run but you have a schedule that is supposed
to run every 5 minutes then you will end up with multiple jobs belonging to the same schedule being executed simultaneously.
Similar overlap of jobs execution may happen in case the job fails and is retried. Keep that in mind when designing your cron jobs.

### Starting the worker

```typescript
import { backgroundJobs } from "./background-jobs-registry";

class Application() {
  async start() {
    // Other app initialization
    // ...
    // When starting the worker you define which groups should the worker consume.
    // Each job has a separate queue, but for the ease of choosing which jobs to consume in given worker
    // there is a concept of groups. Then you can start the worker that consumes particular groups of jobs.
    // In the simplest form you will either put all jobs in single group or consume all groups in
    // one worker. But you may decide to run a dedicated nodejs process to handle a specific group if
    // such need arises.
    const BACKGROUND_JOB_Groups = ["notifications"];
    void backgroundJobs.start(BACKGROUND_JOB_GROUPS,
    // optional configuration
    {
      // How many jobs are processed at once, default: 10
      maxConcurrency: 5,

      // When should the job be considered stuck after it was
      // locked by some worker, default: 600_000 => 10 minutes
      lockTimeoutMS: 600_000

      // How often should the worker check for stuck jobs
      // default 60_000 => 1 minute
      unlockJobsIntervalMS: 60_000

      // The following 2 options control what happens when
      // at the moment there is no jobs to be run. We don't want
      // to constantly spam the DB with queries for new jobs so we
      // need to wait.

      // useChangeStream option determines whether the worker will
      // use Mongo's change stream (https://www.mongodb.com/docs/manual/changeStreams/)
      // functionality to be notified that a new job was inserted into the DB.
      // Default: true
      useChangeStream: true,

      // newJobCheckWaitMS controls how long does the worker wait before just
      // trying to fetch a new job. We have this option even with useChangeStream
      // is true in case something wrong happens with the ChangeStream.
      // Default: 10_000 - 10 seconds
      newJobCheckWaitMS: 10_000,

       // Exclude particular queues from being consumed.
       // Useful when you have one misbehaving job handler in the group and want to quickly
       // turn it off
       exclude: ["MyMisbehavingJob"]
    });
  }

  async stop() {
    // When stopping the worker you can pass the time it should wait for currently running jobs to finish (in ms).
    // The default is 30s (value of 30000).
    await backgroundJobs.stop(10000)  // wait 10 seconds for jobs to finish
  }
}
```

### NestJS integration

In order to get background jobs integrated into NestJS application you can do it using the following guide:

1. Add background jobs module (and start processing jobs )

```
import { BackgroundJobsService } from "@clipboard-health/mongo-jobs"

@Module({
  providers: [BackgroundJobsService],
  exports: [BackgroundJobsService],
})
export class BackgroundJobsModule implements OnApplicationBootstrap, OnModuleDestroy {
  constructor(private readonly jobsService: BackgroundJobsService) {}

  public async onApplicationBootstrap() {
    // start consuming jobs (if the process should be processing jobs)
    // you can omit the if below if you have 1 process that does everything
    if(process.env.BACKGROUND_JOBS_WORKER === "true") {
      void this.jobsService.start(["myGroup1", "myGroup2"]);
    }
  }

  public async onModuleDestroy() {
    // stop the worker (if it's running) with 10 seconds grace period
    await this.jobsService.stop(10000);
  }
}
```

2. Implement the job that potentially needs some dependencies to be injected

```
interface MyJobData {
  someData: string
}

@Injectable
class MyJob implements HandlerInterface<MyJobData> {
  constructor(private readonly featureFlagsService: FeatureFlagsService) { }

  public name = "MyJob"
  public perform(data: JobData) {
    this.featureFlagService.somethingSomething();
    ...
  }
}
```

3. Implement a place where you will schedule a job

```
import { MyJob } from "./my-job";

@Controller
export class MyController {
  constructor(private readonly jobsService: BackgroundJobsService) { }

  @Post(...)
  someAction() {
    ...
    jobsService.enqueue(MyJob, {myData: 123});
  }
}
```

4. Add a module that provides the job and controller and can register the instance of the job instantiated with
   all dependencies into background jobs engine.

```
import { MyJob } from "./myJob";
import { BackgroundJobsModule } from "../../somewhere/background-jobs.module";
import { MyController } from "./myController";

@Module({
  imports: [BackgroundJobsModule, FeatureFlagsModule],
  providers: [MyJob],
  controllers: [MyControllers]
})
export class MyModule {
  constructor(private readonly jobsService: BackgroundJobsService, private readonly myJob: myJob) {
    jobsService.register(myJob, "myGroup1");
 }
}
```

#### NestJS caveats

##### Summary

NestJS may be too eager to resolve dependencies to all Injectable classes that appear in the file, even if you
don't really expect the instance to be provided by NestJS. Therefore, it is recommended to have the places that
enqueue the job have access to all job dependencies, even if you enqueue the job by class.

##### Description

The implementation of the library was trying to make it possible to have a job instance registered in a different module
than where it would be enqueued. So in a scenario where you have:

- WorkerController in a WorkerModule that doesn't have too many dependencies
- VerifyWorkerJob that needs a lot of dependencies from a bunch of other modules

then you would be able to get and register the instance of the job in some module that aggregates all
the required dependencies and then keep WorkerModule simple and just enqueue VerifyWorkerJob by just using
the class (and no need to resolve dependencies).

> **Warning**
> The following example shows the situation where NestJS may break. So it's only to illustrate a point
> and are not supposed to be followed

```

// verify-worker-job.ts
@Injectable
class VerifyWorkerJob {
  ....
}

// complex-module.ts
@Module(
// a lot of dependencies and provider for the job defined
}
class ComplexModule {
  constructor(verifyWorkerJob: VerifyWorkerJob, backgroundJobs: BackgroundJobs, ...otherDependencies) {
    backgroundJobs.register(verifyWorkerJob, "myGroup");
  }
}

// worker-module.ts
@Module(
// not many dependencies and definition of WorkerController
)
class WorkerModule {

}

// worker-controller.ts
import { VerifyWorkerJob } from "verify-worker-job"

@Controller (...)
class WorkerController {
  ...
  someAction() {
    backgroundJobs.enqueue(VerifyWorkerJob, { workerId: "ABC" })
  }

}

```

The idea was that because in WorkerController you don't need an instance of `VerifyWorkerJob` and
you just use the class then it doesn't matter that the worker module wouldn't be able to fulfill all
dependencies for VerifyWorkerJob.

Unfortunately, it seems that Nest sometimes has a weird behavior where it tries to resolve dependencies for
all injectable classes that appear in given file, even if you don't use them in a constructor. Which we found that sometimes
it may cause issues from Nest (and the error message tends to not be very informative).

Therefore, for now the recommendation is to have all dependencies available in modules where you enqueue the job as well. And preferably
have the job and the controller that enqueues the job in the same module.

## Design decisions

This section will describe some major decisions that were made while building the library.

### Jobs Registry Design

- Jobs are based on top of a class that needs to implements an interface. The class must provide a `name` attribute and implement a `perform` method.
  - Having a class based solution makes it very clear of what you need to do to build a proper job handler. You just create your class and implement the interface
    and typescript would force you to do the right thing.
  - Name is there to have a unique identifier of the handler that will be saved in the DB.
  - Perform is the function that will be called when the job is being consumed.

- In order to be able to connect jobs saved in the DB to proper handlers we need a registry that would be able to identify which function to call for particular
  name of the handler saved in the DB.

- The registry keeps one instance of the handler to perform jobs (so it doesn't create new instance of the handler for each job).
  - The reason behind that is so that in case the handler needs to be instantiated with some kind of dependencies it can be done before putting the instance
    in the registry and those dependencies will be there

- When registering the handler in the registry there are 2 possibilities of passing the handler instance:
  - If handler's class has no-arguments constructor then it is possible to just pass a class and registry would
    instantiate that class to get the instance of the handler that will be used for handling jobs
  - If the class constructor has arguments then in order to register the handler you need to pass the instance of the handler
    as the registry won't be able to instantiate the class itself

- When the handler is being registered then the registry would take the name of the handler from the handler's instance and save the name to handler mapping.
  Additionally it will save the handler class to name mapping as well. Thanks to this it is possible to enqueue jobs just by passing the class of the handler even
  for the handler that can't be instantiated by the registry.
  - Enqueueing by just passing class was meant to be useful in NestJS scenarios where the part of the code that enqueues the job may not necessarily know of all
    the dependencies the handler need. As long as the handler instance has been properly registered in the part of code that does know the dependencies
    it would be possible to enqueue the job anywhere. Unfortunately, due to some quirks of NestJS it can't be used to its full potential (as described in
    [NestJS caveats](#nestjs-caveats)).

### Worker Design

- We want to make the library to put as little impact as possible on the DB. Therefore the following decisions were made:
  - The "acquire job" query has been simplified to the extreme. Therefore the library does not support priorities and other secondary functionalities
    of background jobs processing. It works on 3 fields only (`queue`, `nextRunAt` and `lockedAt` - here it is only checked that it is not currently locked).
  - Handling of "stuck" jobs (those that were locked by a worker but never finished - which means that the worker most likely died) is moved out to a separate processing
    loop in order to not complicate the "acquire job" query.
  - When there are no new jobs to be processed then the worker goes into a "waiting period". That means that even if some other job finishes (which would normally trigger
    new "acquire job" query) - we don't ask for new jobs. Waiting period ends when:
    - The waiting time interval elapses, which triggers a query to fetch a new job
    - We get a ping from Mongo's ChangeStream that a new job has been inserted into the DB.
  - Unfortunately, due to the fact that Mongo doesn't support updateMany with a limit, we have to acquire jobs 1 by 1.

### Cron Design

- CRON is designed to work as "a job is scheduled at given times". When the job is scheduled, it is mostly independent from other jobs scheduled within
  the same CRON. This means that in case of retries and crons that schedule jobs quite often you may end up executing jobs "out of order".
- Each job representing a CRON execution will leverage the unique job functionality with a key being
  "name-of-the-cron-#{timestamp-of-execution}". That way we make sure that there is only 1 job per each CRON
  execution
- Cron related job will also have a special field that connects it to the CRON schedule (the value will be the name of the CRON schedule)
- We will also store CRON schedules in a separate collection - for simplicity of verifying when the CRON schedule changes
- Whenever the CRON schedule is registered (when the app launches)
  - We upsert the CRON schedule by name.
    - If there was already a schedule existing and there were changes to the cron schedule we first remove all upcoming jobs for this schedule
  - We make sure to schedule a job for the upcoming CRON execution
  - The upsert things lets us handle changes to CRON schedule, but in case nothing changed then we don't need to
    mess with existing data.
- Whenever CRON job is picked up for work for the first time (not a retry), we schedule a job for the next iteration of CRON.

## Local development commands

See [`package.json`](./package.json) `scripts` for a list of commands.
