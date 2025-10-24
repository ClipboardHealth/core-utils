import type { HandlerInterface } from "../../src";
import { JobRun } from "./jobRun";

type JobData = object;

export class EmptyExampleJob implements HandlerInterface<JobData> {
  public name = "EmptyExampleJob";
  public async perform(_data: JobData) {
    await JobRun.create({ myNumber: 0 });
  }
}
