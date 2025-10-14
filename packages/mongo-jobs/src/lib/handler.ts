import type { BackgroundJobType } from "./job";

export interface HandlerInterface<T> {
  name: string;
  maxAttempts?: number;
  perform(data: T, job?: BackgroundJobType<T>): Promise<void>;
}
