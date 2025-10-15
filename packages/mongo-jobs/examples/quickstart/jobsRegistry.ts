// packages/mongo-jobs/README.md
import { BackgroundJobsService } from "@clipboard-health/mongo-jobs";

import { WelcomeEmailJob } from "./welcomeEmailJob";

const backgroundJobs = new BackgroundJobsService();

backgroundJobs.register(WelcomeEmailJob, "emails");

export { backgroundJobs };
