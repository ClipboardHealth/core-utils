// embedex: packages/mongo-jobs/README.md
import { backgroundJobs } from "./jobsRegistry";

// Remove a cron schedule and its pending jobs
await backgroundJobs.removeCron("daily-report");
