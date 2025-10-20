import { BackgroundJobs } from "@clipboard-health/mongo-jobs";

import { CleanupJob } from "./jobs/cleanupJob";
import { EmailJob } from "./jobs/emailJob";
import { ReportJob } from "./jobs/reportJob";
import { SmsJob } from "./jobs/smsJob";

const backgroundJobs = new BackgroundJobs();

// Register jobs to groups
backgroundJobs.register(EmailJob, "notifications");
backgroundJobs.register(ReportJob, "reports");
backgroundJobs.register(CleanupJob, "maintenance");

// You can register multiple jobs to the same group
backgroundJobs.register(SmsJob, "notifications");
