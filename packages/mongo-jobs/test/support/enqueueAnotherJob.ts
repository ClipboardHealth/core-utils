import { MongoJobs } from "../../src/lib/backgroundJobs";
import type { HandlerInterface } from "../../src/lib/handler";
import { ExampleJob } from "./exampleJob";

interface JobData {
  myNumber: number;
}

export class EnqueueAnotherJob implements HandlerInterface<JobData> {
  public name = "EnqueueAnotherJob";
  public async perform(data: JobData) {
    const backgroundJobs = new MongoJobs();
    backgroundJobs.register(ExampleJob, "default");

    await backgroundJobs.enqueue(ExampleJob, data);
  }
}
