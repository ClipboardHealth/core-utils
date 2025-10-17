// packages/mongo-jobs/README.md
import { BackgroundJobs } from "@clipboard-health/mongo-jobs";

import { WelcomeEmailJob } from "./welcomeEmailJob";

const backgroundJobs = new BackgroundJobs();

backgroundJobs.register(WelcomeEmailJob, "emails");

export { backgroundJobs };
