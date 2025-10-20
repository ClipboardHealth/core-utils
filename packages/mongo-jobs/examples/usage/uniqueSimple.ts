import { backgroundJobs } from "./jobsRegistry";
import { ProcessUserJob } from "./jobs/processUserJob";

// Simple uniqueness - single unique key for both enqueued and running
await backgroundJobs.enqueue(
  ProcessUserJob,
  { userId: "123" },
  {
    unique: "process-user-123",
  },
);
