import type { HandlerInterface } from "../../src/lib/handler";
import type { Semaphore } from "./semaphore";

interface JobData {
  resolvePromise: number | string;
  waitPromise: number | string;
}

export class SemaphoreJob implements HandlerInterface<JobData> {
  public name = "SemaphoreJob";

  constructor(private readonly semaphore: Semaphore) {}

  public async perform({ resolvePromise, waitPromise }: JobData) {
    this.semaphore.resolvePromise(resolvePromise);
    await this.semaphore.getPromise(waitPromise);
  }
}
