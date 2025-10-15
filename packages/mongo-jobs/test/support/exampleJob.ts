import type { HandlerInterface } from "../../src/lib/handler";
import type { BackgroundJobType } from "../../src/lib/job";
import { JobRun } from "./jobRun";

interface JobData {
  myNumber: number;
}

export class ExampleJob implements HandlerInterface<JobData> {
  public name = "ExampleJob";
  public async perform({ myNumber }: JobData, job: BackgroundJobType<JobData>) {
    await JobRun.create({ myNumber, meta: { jobId: job._id.toString() } });
  }
}
