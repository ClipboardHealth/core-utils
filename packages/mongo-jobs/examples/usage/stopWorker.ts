// embedex: packages/mongo-jobs/README.md
import { backgroundJobs } from "./jobsRegistry";

// Graceful shutdown
await backgroundJobs.stop(30_000); // Wait up to 30 seconds for jobs to complete
