import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { withTemporaryFile } from "./temporaryFile";

function signalListenerCount(): number {
  return process.listenerCount("SIGINT") + process.listenerCount("SIGTERM");
}

describe("withTemporaryFile", () => {
  let directory: string;

  beforeEach(() => {
    directory = mkdtempSync(path.join(tmpdir(), "temporary-file-"));
  });

  afterEach(() => {
    rmSync(directory, { force: true, recursive: true });
  });

  it("removes the file and the signal listeners after run throws", () => {
    const filePath = path.join(directory, "config.json");
    const listeners = signalListenerCount();

    expect(() =>
      withTemporaryFile({
        content: "{}",
        path: filePath,
        run: () => {
          throw new Error("run failed");
        },
      }),
    ).toThrow("run failed");
    expect(existsSync(filePath)).toBe(false);
    expect(signalListenerCount()).toBe(listeners);
  });

  it("removes the signal listeners when the write fails", () => {
    const listeners = signalListenerCount();

    expect(() =>
      withTemporaryFile({
        content: "{}",
        path: path.join(directory, "missing", "config.json"),
        run: () => "unreachable",
      }),
    ).toThrow("ENOENT");
    expect(signalListenerCount()).toBe(listeners);
  });
});
