import type { HandlerInterface } from "@clipboard-health/mongo-jobs";

export interface MyJobData {
  userId: string;
  action: string;
}

export class MyJob implements HandlerInterface<MyJobData> {
  public name = "MyJob";
  public maxAttempts = 5;

  async perform({ userId, action }: MyJobData) {
    console.log(`Processing ${action} for user ${userId}`);
  }
}
