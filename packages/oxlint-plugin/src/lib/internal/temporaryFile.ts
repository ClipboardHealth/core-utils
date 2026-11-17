import { rmSync, writeFileSync } from "node:fs";

/**
 * Writes `path`, runs `run`, and removes the file. While `run` blocks, Ctrl-C or SIGTERM still
 * stops Oxlint, which makes `run` throw; the listeners keep Node alive long enough to clean up.
 */
export function withTemporaryFile<Result>(params: {
  content: string;
  path: string;
  run: () => Result;
}): Result {
  const keepAlive = (): void => {
    // Removing the listeners in `finally` restores the default exit-on-signal behavior.
  };

  process.on("SIGINT", keepAlive);
  process.on("SIGTERM", keepAlive);
  try {
    writeFileSync(params.path, params.content);
    return params.run();
  } finally {
    try {
      rmSync(params.path, { force: true });
    } finally {
      process.off("SIGINT", keepAlive);
      process.off("SIGTERM", keepAlive);
    }
  }
}
