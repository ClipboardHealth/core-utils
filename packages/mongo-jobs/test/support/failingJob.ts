import type { HandlerInterface } from "../../src";

type JobData = object;

export class FailingJob implements HandlerInterface<JobData> {
  public name = "FailingJob";
  public async perform(_data: JobData): Promise<void> {
    return Promise.reject(new Error("Job Failed"));
  }
}
