import type { HandlerInterface } from "../../src";

type JobData = object;

export class FailingJob implements HandlerInterface<JobData> {
  public name = "FailingJob";
  public async perform(_data: JobData) {
    throw new Error("Job Failed");
  }
}
