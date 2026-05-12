import type { ChangeStream } from "mongodb";

import type { JobsRepository } from "../../../src/lib/internal/jobsRepository";
import { FairQueueConsumer } from "../../../src/lib/internal/worker/fairQueueConsumer";
import type { BackgroundJobType } from "../../../src/lib/job";
import { TestLogger } from "../../support/testLogger";

type ChangeStreamListener = (...arguments_: unknown[]) => void;

interface FakeChangeStream {
  on: (event: string, listener: ChangeStreamListener) => FakeChangeStream;
  emit: (event: string, ...arguments_: unknown[]) => void;
  close: () => Promise<void>;
  removeAllListeners: () => void;
}

function createFakeChangeStream() {
  const listeners = new Map<string, ChangeStreamListener[]>();
  const close = vi.fn<() => Promise<void>>();
  const removeAllListeners = vi.fn<() => void>();
  const stream: FakeChangeStream = {
    on(event, listener) {
      const existing = listeners.get(event) ?? [];
      existing.push(listener);
      listeners.set(event, existing);
      return stream;
    },
    emit(event, ...arguments_) {
      for (const listener of listeners.get(event) ?? []) {
        listener(...arguments_);
      }
    },
    close,
    removeAllListeners,
  };
  return { stream, close, removeAllListeners };
}

function createJobsRepositoryMock(stream: FakeChangeStream): JobsRepository {
  return {
    watchUpserts: vi
      .fn<() => ChangeStream<BackgroundJobType<unknown>>>()
      .mockReturnValue(stream as unknown as ChangeStream<BackgroundJobType<unknown>>),
  } as unknown as JobsRepository;
}

describe(FairQueueConsumer, () => {
  it("logs and clears the stream when the change stream emits an error so the process does not crash", async () => {
    const { stream, close, removeAllListeners } = createFakeChangeStream();
    const jobsRepository = createJobsRepositoryMock(stream);
    const logger = new TestLogger();
    const consumer = new FairQueueConsumer(["default"], jobsRepository, logger);

    consumer.startListeningForQueueChanges();

    const networkError = new Error("read ECONNRESET");
    expect(() => {
      stream.emit("error", networkError);
    }).not.toThrow();

    expect(logger.errorLogs).toHaveLength(1);
    expect(logger.errorLogs[0]).toStrictEqual({
      message: "Jobs change stream error; falling back to polling",
      context: { error: networkError },
    });
    expect(close).toHaveBeenCalledTimes(1);

    await consumer.stop();
    expect(removeAllListeners).not.toHaveBeenCalled();
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("does not throw when no logger is provided and the change stream emits an error", () => {
    const { stream, close } = createFakeChangeStream();
    const jobsRepository = createJobsRepositoryMock(stream);
    const consumer = new FairQueueConsumer(["default"], jobsRepository);

    consumer.startListeningForQueueChanges();

    expect(() => {
      stream.emit("error", new Error("read ECONNRESET"));
    }).not.toThrow();
    expect(close).toHaveBeenCalledTimes(1);
  });
});
