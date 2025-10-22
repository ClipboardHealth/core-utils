// embedex: packages/mongo-jobs/README.md
import { BackgroundJobs } from "@clipboard-health/mongo-jobs";

import { DailyReportJob } from "./jobs/dailyReportJob";

const backgroundJobs = new BackgroundJobs();

// Register a cron job
await backgroundJobs.registerCron(DailyReportJob, {
  // Group assignment (same as regular registration)
  group: "reports",

  // Unique name for this schedule
  scheduleName: "daily-report",

  // Cron expression (standard 5-field format)
  cronExpression: "0 9 * * *", // Every day at 9 AM

  // Optional: timezone for cron evaluation (default: "utc")
  timeZone: "America/New_York",

  // Data to pass to each job execution
  data: { reportType: "daily" },
});
