import { exec, type ExecOptions } from "node:child_process";
import { promisify } from "node:util";

const execAsync = promisify(exec);

interface ExecAndLogParams extends ExecOptions {
  command: readonly string[];
  timeout: number;
  verbose: boolean;
}

export async function execAndLog(params: ExecAndLogParams) {
  const { command, timeout, verbose } = params;

  const result = await execAsync(command.join(" "), { timeout });
  if (verbose && result.stdout) {
    console.log(result.stdout.trim());
  }

  return result;
}
