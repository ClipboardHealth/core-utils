// packages/mongo-jobs/README.md
import { MongoJobs } from "@clipboard-health/mongo-jobs";

import { WelcomeEmailJob } from "./welcomeEmailJob";

const backgroundJobs = new MongoJobs();

backgroundJobs.register(WelcomeEmailJob, "emails");

export { backgroundJobs };
