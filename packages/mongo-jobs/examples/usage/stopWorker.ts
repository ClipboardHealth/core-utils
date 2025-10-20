import { backgroundJobs } from "./jobsRegistry";

// Graceful shutdown
await backgroundJobs.stop(30000); // Wait up to 30 seconds for jobs to complete
