// embedex: packages/mongo-jobs/README.md
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
