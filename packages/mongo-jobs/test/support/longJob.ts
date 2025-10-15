import { setTimeout } from "node:timers/promises";

import type { HandlerInterface } from "../../src";
import { JobRun } from "./jobRun";

interface JobData {
  sleepTime: number;
  myNumber: number;
}

export class LongJob implements HandlerInterface<JobData> {
  public name = "LongJob";
  public async perform({ myNumber, sleepTime }: JobData) {
    await setTimeout(sleepTime);
    await JobRun.create({ myNumber });
  }
}
