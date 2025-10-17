import { setTimeout } from "node:timers/promises";

import mongoose from "mongoose";

import { BackgroundJobs,type ConstructorOptions } from "../../src";
import { defaultConnectToMongo } from "./connectToMongo";
import { dropDatabase } from "./dropDatabase";
import { getJestWorkerUri } from "./getJestWorkerUri";

export interface TestContext {
  tearDown: () => Promise<void>;
  backgroundJobs: BackgroundJobs;
}

export async function createTestContext(
  backgroundJobsOptions: ConstructorOptions = {},
): Promise<TestContext> {
  const databaseUrlTemplate = "mongodb://localhost:27017/mongo-jobs-test-{{jest_worker_id}}";
  const databaseUrl = getJestWorkerUri(databaseUrlTemplate);

  await dropDatabase(databaseUrl);
  await defaultConnectToMongo(databaseUrl);

  const backgroundJobs = new BackgroundJobs(backgroundJobsOptions);
  await backgroundJobs.jobModel.createIndexes();

  return {
    tearDown: async () => {
      try {
        await backgroundJobs.stop(200);

        // Add a delay to give pending MongoDB operations time to complete
        await setTimeout(200);

        // Close MongoDB connections
        try {
          await mongoose.connection.close();
          await mongoose.disconnect();
        } catch {
          // Might already be closed/disconnected
        }
      } catch (error) {
        // Log, but don't throw to ensure cleanup continues
        // eslint-disable-next-line no-console
        console.error("Error during test teardown:", error);
      }
    },
    backgroundJobs,
  };
}
