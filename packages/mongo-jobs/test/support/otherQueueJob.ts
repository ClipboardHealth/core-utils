import type { HandlerInterface } from "../../src/lib/handler";
import { JobRun } from "./jobRun";

interface JobData {
  myNumber: number;
}

export class OtherQueueJob implements HandlerInterface<JobData> {
  public name = "OtherQueueJob";
  public async perform({ myNumber }: JobData) {
    await JobRun.create({ myNumber });
  }
}
