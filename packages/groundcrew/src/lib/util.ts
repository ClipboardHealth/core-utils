import { LinearClient } from "@linear/sdk";

export async function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted === true) {
    return;
  }
  await new Promise<void>((resolve) => {
    // Both paths funnel through `settle`, which clears the timer and
    // removes the listener before resolving. Once settle runs, neither
    // caller can fire again — but the lint plugin can't see that, so the
    // disable below is necessary. Without the explicit listener removal,
    // reusing one signal across many sleeps (the watch loop pattern)
    // leaks a listener per call.
    const settle = (): void => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", settle);
      // oxlint-disable-next-line promise/no-multiple-resolved -- settle is callable from two sources but disarms both before resolving
      resolve();
    };
    const timer = setTimeout(settle, ms);
    signal?.addEventListener("abort", settle);
  });
}

export function writeOutput(message?: string): void {
  const arguments_ = message === undefined ? [] : [message];
  // oxlint-disable-next-line no-console -- Centralized CLI stdout writer.
  console.log(...arguments_);
}

export function writeError(message: string): void {
  // oxlint-disable-next-line no-console -- Centralized CLI stderr writer.
  console.error(message);
}

export function clearOutput(): void {
  // oxlint-disable-next-line no-console -- Centralized CLI screen clear.
  console.clear();
}

export function log(message: string): void {
  const timestamp = new Date().toLocaleTimeString();
  writeOutput(`[${timestamp}] ${message}`);
}

type LogEventFieldValue = boolean | number | string | readonly string[] | undefined;

function formatLogEventFieldValue(value: Exclude<LogEventFieldValue, undefined>): string {
  const raw = Array.isArray(value) ? value.join(",") : String(value);
  if (/^[\w./:-]+$/.test(raw)) {
    return raw;
  }
  return JSON.stringify(raw);
}

export function logEvent(event: string, fields: Record<string, LogEventFieldValue>): void {
  const parts = [`event=${formatLogEventFieldValue(event)}`];
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined) {
      continue;
    }
    parts.push(`${key}=${formatLogEventFieldValue(value)}`);
  }
  writeOutput(parts.join(" "));
}

export function readEnvironmentVariable(name: string): string | undefined {
  // oxlint-disable-next-line node/no-process-env -- Centralized environment accessor.
  return process.env[name];
}

export function getLinearClient(): LinearClient {
  const apiKey = readEnvironmentVariable("LINEAR_API_KEY");
  if (apiKey === undefined || apiKey.length === 0) {
    throw new Error("LINEAR_API_KEY not set. Add it to your environment.");
  }
  return new LinearClient({ apiKey });
}

export function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === "string") {
    return error;
  }
  // Fall back to JSON for object throws — `String({})` collapses to
  // `[object Object]` and loses every useful detail.
  try {
    return JSON.stringify(error);
  } catch {
    return Object.prototype.toString.call(error);
  }
}
