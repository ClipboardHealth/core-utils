import type { HandlerInterface } from "../../src";

// eslint-disable-next-line @typescript-eslint/no-empty-interface
interface JobData {}

export class FailingJob implements HandlerInterface<JobData> {
  public name = "FailingJob";
  public async perform(_data: JobData) {
    throw new Error("Job Failed");
  }
}
