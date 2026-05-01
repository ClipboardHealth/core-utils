import type { HandlerInterface } from "../../src/lib/handler";

interface JobData {
  myNumber: number;
}

export class JobWithDependencies implements HandlerInterface<JobData> {
  public name = "JobWithDependencies";

  public constructor(public dependencyName: string) {}
  public async perform(_data: JobData) {
    await Promise.resolve({});
  }
}
