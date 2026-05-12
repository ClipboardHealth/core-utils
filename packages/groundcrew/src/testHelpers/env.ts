export function setEnvironmentVariable(name: string, value: string): void {
  // oxlint-disable-next-line node/no-process-env -- Centralized environment mutator for tests.
  process.env[name] = value;
}

export function deleteEnvironmentVariable(name: string): void {
  // oxlint-disable-next-line node/no-process-env -- Centralized environment mutator for tests.
  Reflect.deleteProperty(process.env, name);
}

export function snapshotEnvironmentVariables(): Record<string, string | undefined> {
  // oxlint-disable-next-line node/no-process-env -- Centralized environment snapshot helper for tests.
  return { ...process.env };
}
