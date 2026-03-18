/**
 * Standalone script that exercises the full BackgroundJobs lifecycle in a separate Node process.
 *
 * It is executed by processExit.spec.ts via `npx tsx` to verify that the Node process
 * actually exits after `stop()` is called (no leaked timers or open handles keeping it alive).
 *
 * Usage: npx tsx emulateCompletionOfBackgroundJobs.ts [shutdownTimeoutMs] [jobDurationMs]
 *
 *   shutdownTimeoutMs — how long `stop()` waits for running jobs before giving up (default: 120000)
 *   jobDurationMs     — artificial delay inside SimpleJob.perform() to simulate a long-running job (default: 0)
 */

import mongoose from "mongoose";

import { BackgroundJobs } from "../../src";
import type { HandlerInterface } from "../../src/lib/handler";

const arguments_ = process.argv.slice(2);
const shutdownTimeoutMs = Number(arguments_[0]) || 120_000;
const jobDurationMs = Number(arguments_[1]) || 0;

function log(message: string) {
  process.stderr.write(`[processExitScript] ${message}\n`);
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

class SimpleJob implements HandlerInterface<{ value: number }> {
  public name = "SimpleJob";

  public async perform() {
    log("Execution of a SimpleJob");
    if (jobDurationMs > 0) {
      log(`SimpleJob sleeping for ${jobDurationMs}ms...`);
      await sleep(jobDurationMs);
    }
  }
}

const DATABASE_URL = `mongodb://localhost:27017/mongo-jobs-process-exit-test-${process.pid}`;

async function main() {
  log("Connecting to MongoDB...");
  const mongooseInstance = await mongoose.connect(DATABASE_URL, { maxPoolSize: 2 });

  log("Creating BackgroundJobs...");
  const logger = {
    info: (...arguments_: unknown[]) => { log(`[info] ${arguments_.join(" ")}`); },
    error: (...arguments_: unknown[]) => { log(`[error] ${arguments_.join(" ")}`); },
  };
  const backgroundJobs = new BackgroundJobs({ dbConnection: mongooseInstance.connection, logger });
  await backgroundJobs.jobModel.createIndexes();

  log("Registering handler...");
  backgroundJobs.register(SimpleJob, "default");

  log("Registering cron job (new run every second)...");
  await backgroundJobs.registerCron(SimpleJob, {
    group: "default",
    cronExpression: "* * * * *",
    scheduleName: "cron-test",
    data: { value: 42 },
  });

  log("Starting worker...");
  await backgroundJobs.start(["default"], {
    newJobCheckWaitMS: 100,
    refreshQueuesIntervalMS: 100,
    useChangeStream: true,
  });

  log("Enqueueing job...");
  await backgroundJobs.enqueue(SimpleJob, { value: 1 });

  log("Waiting for job to process and let cron run few times before stopping...");
  await sleep(2000);

  log(`Stopping worker with ${shutdownTimeoutMs}ms timeout...`);
  await backgroundJobs.stop(shutdownTimeoutMs);
  log("Worker stopped.");

  log("Dropping test DB and closing MongoDB...");
  await mongoose.connection.db?.dropDatabase();
  await mongoose.connection.close();
  await mongoose.disconnect();
  log("MongoDB closed. Process should exit now.");
}

// eslint-disable-next-line unicorn/prefer-top-level-await
void main().catch((error) => { log(`Error: ${error}`); });
