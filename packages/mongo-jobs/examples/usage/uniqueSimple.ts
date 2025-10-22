// embedex: packages/mongo-jobs/README.md
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
