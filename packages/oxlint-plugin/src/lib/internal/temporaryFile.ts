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
  writeFileSync(params.path, params.content);
  try {
    return params.run();
  } finally {
    rmSync(params.path, { force: true });
    process.off("SIGINT", keepAlive);
    process.off("SIGTERM", keepAlive);
  }
}
