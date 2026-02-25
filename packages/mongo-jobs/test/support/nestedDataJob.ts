import type { HandlerInterface } from "../../src/lib/handler";
import type { BackgroundJobType } from "../../src/lib/job";

interface NestedJobData {
  someField: string;
  metadata: Record<string, unknown>;
}

/**
 * Stores the received data on a static property so tests can verify
 * that nested empty objects survive the enqueue → perform round-trip.
 */
export class NestedDataJob implements HandlerInterface<NestedJobData> {
  public static receivedData: NestedJobData | undefined;
  public static receivedJob: BackgroundJobType<NestedJobData> | undefined;

  public static reset() {
    NestedDataJob.receivedData = undefined;
    NestedDataJob.receivedJob = undefined;
  }

  public name = "NestedDataJob";

  public async perform(data: NestedJobData, job: BackgroundJobType<NestedJobData>) {
    NestedDataJob.receivedData = data;
    NestedDataJob.receivedJob = job;
  }
}
