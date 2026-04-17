import { describe, expect, it } from "vitest";
import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const emulateScript = path.join(__dirname, "support", "emulateCompletionOfBackgroundJobs.ts");
const EXIT_TIMEOUT_MS = 5000;

describe("Process exit after stop", () => {
  it(
    "should allow the Node process to exit after stop() is called on background jobs",
    async () => {
      // The large timeout is critical to reproduce the bug: Worker.stop() uses Promise.race
      // between a delay(waitTime) and waiting for running jobs. When jobs finish first, the
      // delay's setTimeout is never cleared, keeping the Node event loop alive for the full
      // waitTime duration even though stop() has already returned.
      const shutdownTimeoutMs = "120000";

      const { stderr } = await execFileAsync("npx", ["tsx", emulateScript, shutdownTimeoutMs], {
        timeout: EXIT_TIMEOUT_MS,
      });

      expect(stderr).toContain("Process should exit now.");
    },
    EXIT_TIMEOUT_MS + 1000,
  );

  it(
    "should log running jobs when there are long running background jobs (longer than graceful shutdown period)",
    async () => {
      // Job takes 3s, but shutdown timeout is only 0.5s
      const shutdownTimeoutMs = "500";
      const jobDurationMs = "3000";

      const { stderr } = await execFileAsync(
        "npx",
        ["tsx", emulateScript, shutdownTimeoutMs, jobDurationMs],
        { timeout: EXIT_TIMEOUT_MS },
      );

      expect(stderr).toContain(
        "Background Jobs: Stopped with pending jobs (Node.js process will not exit gracefully)",
      );
    },
    EXIT_TIMEOUT_MS + 1000,
  );
});
