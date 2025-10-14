import type { HandlerInterface } from "../../src/lib/handler";
import { JobRun } from "./jobRun";

interface JobData {
  myNumber: number;
  shouldFail: boolean;
}

export class NoRetryJob implements HandlerInterface<JobData> {
  public name = "NoRetryJob";
  public maxAttempts = 1;
  public async perform({ myNumber, shouldFail }: JobData) {
    await JobRun.create({ myNumber });

    if (shouldFail) {
      throw new Error("Failing");
    }
  }
}
