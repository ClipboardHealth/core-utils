import { type ChildProcess, execFileSync, spawn } from "node:child_process";

const DEFAULT_RUN_TIMEOUT_MS = 120_000;
const RUN_MAX_BUFFER_BYTES = 10 * 1024 * 1024;
const ERROR_OUTPUT_MAX_CHARS = 4000;
const ABORT_SIGNAL: NodeJS.Signals = "SIGINT";
const TIMEOUT_SIGNAL: NodeJS.Signals = "SIGTERM";
const FORCE_KILL_SIGNAL: NodeJS.Signals = "SIGKILL";
const FORCE_KILL_DELAY_MS = 5000;

export interface RunCommandOptions {
  cwd?: string;
  signal?: AbortSignal;
  timeoutMs?: number;
  stdio?: "captured" | "inherit";
  trim?: boolean;
}

export function runCommand(
  command: string,
  arguments_: readonly string[],
  options: RunCommandOptions & { stdio: "inherit" },
): void;
export function runCommand(
  command: string,
  arguments_: readonly string[],
  options?: RunCommandOptions & { stdio?: "captured" },
): string;
export function runCommand(
  command: string,
  arguments_: readonly string[],
  options: RunCommandOptions = {},
): string | void {
  try {
    if (options.stdio === "inherit") {
      execFileSync(command, [...arguments_], {
        cwd: options.cwd,
        maxBuffer: RUN_MAX_BUFFER_BYTES,
        stdio: "inherit",
        timeout: options.timeoutMs ?? DEFAULT_RUN_TIMEOUT_MS,
      });
      return;
    }

    const output = execFileSync(command, [...arguments_], {
      cwd: options.cwd,
      encoding: "utf8",
      maxBuffer: RUN_MAX_BUFFER_BYTES,
      stdio: ["ignore", "pipe", "pipe"],
      timeout: options.timeoutMs ?? DEFAULT_RUN_TIMEOUT_MS,
    });
    return options.trim === false ? output : output.trim();
  } catch (error) {
    throw normalizeCommandError({ command, args: arguments_, error });
  }
}

export async function runCommandAsync(
  command: string,
  arguments_: readonly string[],
  options: RunCommandOptions & { stdio: "inherit" },
): Promise<undefined>;
export async function runCommandAsync(
  command: string,
  arguments_: readonly string[],
  options?: RunCommandOptions & { stdio?: "captured" },
): Promise<string>;
export async function runCommandAsync(
  command: string,
  arguments_: readonly string[],
  options: RunCommandOptions = {},
): Promise<string | undefined> {
  if (options.signal?.aborted === true) {
    throw normalizeCommandError({
      command,
      args: arguments_,
      error: Object.assign(new Error("Command aborted before start"), { signal: ABORT_SIGNAL }),
    });
  }

  const shouldUseProcessGroup = options.signal !== undefined && process.platform !== "win32";
  const child = spawn(command, [...arguments_], {
    cwd: options.cwd,
    detached: shouldUseProcessGroup,
    stdio: options.stdio === "inherit" ? "inherit" : ["ignore", "pipe", "pipe"],
  });

  return await new Promise<string | undefined>((resolve, reject) => {
    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    let stdoutLength = 0;
    let stderrLength = 0;
    let settled = false;
    let requestedSignal: NodeJS.Signals | undefined;
    let timeoutTimer: NodeJS.Timeout | undefined;
    let forceKillTimer: NodeJS.Timeout | undefined;

    function cleanup(): void {
      if (timeoutTimer !== undefined) {
        clearTimeout(timeoutTimer);
      }
      if (forceKillTimer !== undefined) {
        clearTimeout(forceKillTimer);
      }
      options.signal?.removeEventListener("abort", abortChild);
    }

    function settleWithError(error: unknown): void {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      reject(normalizeCommandError({ command, args: arguments_, error }));
    }

    function killChild(signal: NodeJS.Signals): void {
      requestedSignal ??= signal;
      try {
        killChildProcess(child, signal, shouldUseProcessGroup);
      } catch {
        // The child may have exited between the abort request and the kill.
      }
      if (signal !== FORCE_KILL_SIGNAL && forceKillTimer === undefined) {
        forceKillTimer = setTimeout(() => {
          try {
            killChildProcess(child, FORCE_KILL_SIGNAL, shouldUseProcessGroup);
          } catch {
            // Best-effort escalation; close/error will settle the promise.
          }
        }, FORCE_KILL_DELAY_MS);
      }
    }

    function abortChild(): void {
      killChild(ABORT_SIGNAL);
    }

    function appendOutput(input: {
      chunks: Buffer[];
      currentLength: number;
      chunk: Buffer | string;
      streamName: "stderr" | "stdout";
    }): number {
      const buffer = Buffer.isBuffer(input.chunk) ? input.chunk : Buffer.from(input.chunk, "utf8");
      const nextCombinedLength = stdoutLength + stderrLength + buffer.length;
      if (nextCombinedLength > RUN_MAX_BUFFER_BYTES) {
        settleWithError(
          Object.assign(new Error("combined stdout/stderr maxBuffer exceeded"), {
            signal: TIMEOUT_SIGNAL,
          }),
        );
        killChild(TIMEOUT_SIGNAL);
        return input.currentLength;
      }
      input.chunks.push(buffer);
      return input.currentLength + buffer.length;
    }

    if (options.stdio !== "inherit") {
      child.stdout?.on("data", (chunk: Buffer | string) => {
        stdoutLength = appendOutput({
          chunks: stdoutChunks,
          currentLength: stdoutLength,
          chunk,
          streamName: "stdout",
        });
      });
      child.stderr?.on("data", (chunk: Buffer | string) => {
        stderrLength = appendOutput({
          chunks: stderrChunks,
          currentLength: stderrLength,
          chunk,
          streamName: "stderr",
        });
      });
    }

    child.once("error", (error) => {
      settleWithError(error);
    });
    child.once("close", (status, signal) => {
      cleanup();
      if (settled) {
        return;
      }
      settled = true;
      const stdout = outputBuffer(stdoutChunks, stdoutLength);
      const stderr = outputBuffer(stderrChunks, stderrLength);
      const exitSignal = signal ?? requestedSignal;
      if (status === 0 && exitSignal === undefined) {
        const output = stdout?.toString("utf8") ?? "";
        resolve(options.stdio === "inherit" ? undefined : formatOutput(output, options));
        return;
      }
      reject(
        normalizeCommandError({
          command,
          args: arguments_,
          error: Object.assign(new Error("Command exited unsuccessfully"), {
            signal: exitSignal,
            status: status ?? undefined,
            stderr,
            stdout,
          }),
        }),
      );
    });

    if (options.signal?.aborted === true) {
      abortChild();
    } else {
      options.signal?.addEventListener("abort", abortChild, { once: true });
    }
    const timeoutMs = options.timeoutMs ?? DEFAULT_RUN_TIMEOUT_MS;
    if (timeoutMs > 0) {
      timeoutTimer = setTimeout(() => {
        killChild(TIMEOUT_SIGNAL);
      }, timeoutMs);
    }
  });
}

function killChildProcess(
  child: ChildProcess,
  signal: NodeJS.Signals,
  shouldUseProcessGroup: boolean,
): void {
  if (shouldUseProcessGroup && child.pid !== undefined) {
    process.kill(-child.pid, signal);
    return;
  }
  child.kill(signal);
}

function outputBuffer(chunks: readonly Buffer[], length: number): Buffer | undefined {
  if (chunks.length === 0) {
    return undefined;
  }
  return Buffer.concat(chunks, length);
}

function formatOutput(output: string, options: RunCommandOptions): string {
  return options.trim === false ? output : output.trim();
}

function normalizeCommandError(arguments_: {
  command: string;
  args: readonly string[];
  error: unknown;
}): Error {
  const parts = [`Command failed: ${formatCommand(arguments_.command, arguments_.args)}`];
  const status = statusCode(arguments_.error);
  if (typeof status === "number") {
    parts.push(`Exit status: ${status}`);
  }
  const signal = errorSignal(arguments_.error);
  if (typeof signal === "string" && signal.length > 0) {
    parts.push(`Signal: ${signal}`);
  }
  const stderr = stderrText(arguments_.error);
  if (stderr !== undefined && stderr.length > 0) {
    parts.push(`Stderr:\n${stderr}`);
  }
  const stdout = stdoutText(arguments_.error);
  if (stdout !== undefined && stdout.length > 0) {
    parts.push(`Stdout:\n${stdout}`);
  }
  if (arguments_.error instanceof Error && arguments_.error.message.length > 0) {
    parts.push(`Cause: ${arguments_.error.message}`);
  }
  return new Error(parts.join("\n"), { cause: arguments_.error });
}

function statusCode(error: unknown): number | undefined {
  if (typeof error !== "object" || error === null || !("status" in error)) {
    return undefined;
  }
  return typeof error.status === "number" ? error.status : undefined;
}

function errorSignal(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null || !("signal" in error)) {
    return undefined;
  }
  return typeof error.signal === "string" ? error.signal : undefined;
}

function stderrText(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null || !("stderr" in error)) {
    return undefined;
  }
  return outputText(error.stderr);
}

function stdoutText(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null || !("stdout" in error)) {
    return undefined;
  }
  return outputText(error.stdout);
}

function outputText(value: unknown): string | undefined {
  let text: string;
  if (typeof value === "string") {
    text = value;
  } else if (Buffer.isBuffer(value)) {
    text = value.toString("utf8");
  } else {
    return undefined;
  }
  return truncateErrorOutput(text.trim());
}

function truncateErrorOutput(text: string): string {
  if (text.length <= ERROR_OUTPUT_MAX_CHARS) {
    return text;
  }
  return `${text.slice(0, ERROR_OUTPUT_MAX_CHARS)}\n... truncated ${text.length - ERROR_OUTPUT_MAX_CHARS} chars`;
}

function formatCommand(command: string, arguments_: readonly string[]): string {
  return [command, ...arguments_].join(" ");
}
