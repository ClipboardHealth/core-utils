import { backgroundJobs } from "./jobsRegistry";

// Start a worker for specific groups
await backgroundJobs.start(["notifications", "reports"], {
  maxConcurrency: 20,
});
