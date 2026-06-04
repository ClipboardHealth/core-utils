import type { BackgroundJobType } from "./job";

export interface HandlerInterface<T> {
  name: string;
  maxAttempts?: number;
  // oxlint-disable-next-line typescript/method-signature-style -- method needed for class implementors
  perform(data: T, job?: BackgroundJobType<T>): Promise<void>;
}
