import type { BackgroundJobType, HandlerInterface } from "@clipboard-health/mongo-jobs";

export interface MyJobData {
  userId: string;
  action: string;
}

export class MyJob implements HandlerInterface<MyJobData> {
  // Required: unique name for this job type
  public name = "MyJob";

  // Optional: max retry attempts (default: 10)
  public maxAttempts = 5;

  // Required: the actual job logic
  async perform(data: MyJobData, job?: BackgroundJobType<MyJobData>) {
    // Job implementation
    console.log(`Processing ${data.action} for user ${data.userId}`);

    // Optional: access job metadata
    if (job) {
      console.log(`Job ID: ${job._id.toString()}`);
      console.log(`Attempt: ${job.attemptsCount}`);
    }
  }
}
