// embedex: packages/mongo-jobs/README.md
import { backgroundJobs } from "./jobsRegistry";
import type { MyJobData } from "./myJob";

// Enqueue by job name requires explicit generic for type safety
await backgroundJobs.enqueue<MyJobData>("MyJob", { userId: "123", action: "process" });
