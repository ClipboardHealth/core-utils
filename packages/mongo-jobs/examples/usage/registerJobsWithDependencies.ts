// embedex: packages/mongo-jobs/README.md
import { BackgroundJobs } from "@clipboard-health/mongo-jobs";

import { EmailServiceJob } from "./jobs/emailServiceJob";

const backgroundJobs = new BackgroundJobs();

// For jobs with constructor dependencies, register an instance
const emailService = {
  async send(to: string, subject: string, body: string) {
    console.log(`Sending email to ${to}: ${subject} : ${body}`);
  },
};

backgroundJobs.register(new EmailServiceJob(emailService), "notifications");
