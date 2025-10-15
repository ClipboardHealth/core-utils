import type { HandlerInterface } from "../../src";
import { JobRun } from "./jobRun";

// eslint-disable-next-line @typescript-eslint/no-empty-interface
interface JobData {}

export class EmptyExampleJob implements HandlerInterface<JobData> {
  public name = "EmptyExampleJob";
  public async perform(_data: JobData) {
    await JobRun.create({ myNumber: 0 });
  }
}
