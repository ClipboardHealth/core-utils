// embedex: packages/mongo-jobs/README.md
import { SendEmailJob } from "./jobs/sendEmailJob";
import { backgroundJobs } from "./jobsRegistry";

// Example: Allow multiple enqueued but only one running
await backgroundJobs.enqueue(
  SendEmailJob,
  { userId: "123", emailType: "welcome" },
  {
    unique: {
      enqueuedKey: undefined, // Allow multiple enqueued emails
      runningKey: "send-email-123", // But only one sending at a time
    },
  },
);
