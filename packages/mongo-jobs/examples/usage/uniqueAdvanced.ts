import { backgroundJobs } from "./jobsRegistry";
import { ProcessUserJob } from "./jobs/processUserJob";

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
