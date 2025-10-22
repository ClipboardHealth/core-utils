// embedex: packages/mongo-jobs/README.md
import { backgroundJobs } from "./jobsRegistry";
import { WelcomeEmailJob } from "./welcomeEmailJob";

await backgroundJobs.enqueue(WelcomeEmailJob, {
  userId: "123",
  email: "user@example.com",
});
