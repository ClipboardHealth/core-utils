export interface CliParams {
  args: readonly string[];
  cwd: string;
  env: Readonly<Record<string, string | undefined>>;
  write: (output: string) => void;
}

/** Runs a CLI command against the process, exiting 2 with the message on an unexpected error. */
export function runCli(run: (params: CliParams) => { exitCode: number }): void {
  try {
    const { exitCode } = run({
      args: process.argv.slice(2),
      cwd: process.cwd(),
      env: process.env,
      write: (output) => {
        process.stdout.write(output);
      },
    });
    process.exitCode = exitCode;
  } catch (error: unknown) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 2;
  }
}
