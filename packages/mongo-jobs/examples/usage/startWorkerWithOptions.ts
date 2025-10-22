// embedex: packages/mongo-jobs/README.md
import { backgroundJobs } from "./jobsRegistry";

// Start with all available options
await backgroundJobs.start(["notifications"], {
  // Maximum concurrent jobs (default: 10)
  maxConcurrency: 10,

  // Time to wait when no jobs available, in ms (default: 10000)
  newJobCheckWaitMS: 5000,

  // Use MongoDB change streams for instant job detection (default: true)
  useChangeStream: true,

  // Lock timeout for stuck jobs, in ms (default: 600000 = 10 minutes)
  lockTimeoutMS: 300_000,

  // Interval to check for stuck jobs, in ms (default: 60000 = 1 minute)
  unlockJobsIntervalMS: 30_000,

  // Interval to refresh queue list, in ms (default: 30000 = 30 seconds)
  refreshQueuesIntervalMS: 60_000,

  // Exclude specific queues from processing
  exclude: ["low-priority-queue"],
});
