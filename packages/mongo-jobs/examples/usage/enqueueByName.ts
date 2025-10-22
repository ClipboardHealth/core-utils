// embedex: packages/mongo-jobs/README.md
import { backgroundJobs } from "./jobsRegistry";

// Enqueue by job name (when handler is already registered)
await backgroundJobs.enqueue("MyJob", { userId: "123", action: "process" });
