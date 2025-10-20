import type { HandlerInterface } from "@clipboard-health/mongo-jobs";

export interface ProcessUserJobData {
  userId: string;
}

export class ProcessUserJob implements HandlerInterface<ProcessUserJobData> {
  public name = "ProcessUserJob";
  public maxAttempts = 3;

  async perform({ userId }: ProcessUserJobData) {
    // Process user logic
    console.log(`Processing user ${userId}`);
    await this.processUser(userId);
  }

  private async processUser(_userId: string) {
    // User processing implementation
  }
}
