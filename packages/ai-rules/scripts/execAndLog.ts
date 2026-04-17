import { execFile, type ExecFileOptions } from "node:child_process";
import { promisify } from "node:util";

// oxlint-disable-next-line typescript/strict-void-return -- execFile returns ChildProcess by design
const execAsync = promisify(execFile);

interface ExecAndLogParams extends ExecFileOptions {
  command: readonly string[];
  verbose: boolean;
}

export async function execAndLog(
  params: ExecAndLogParams,
): Promise<{ stdout: string; stderr: string }> {
  const { command, verbose, ...rest } = params;

  const [cmd, ...execArguments] = command;
  if (!cmd) {
    throw new Error("Executable is required");
  }

  const result = await execAsync(cmd, execArguments, { ...rest, encoding: "utf8" });

  if (verbose && result.stdout) {
    console.log(result.stdout.trim());
  }

  if (result.stderr) {
    console.error(result.stderr.trim());
  }

  return result;
}
