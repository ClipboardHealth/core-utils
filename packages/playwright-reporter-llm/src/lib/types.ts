export interface TestSummary {
  total: number;
  passed: number;
  failed: number;
  flaky: number;
  skipped: number;
  timedOut: number;
  interrupted: number;
}

export interface TestEnvironment {
  playwrightVersion: string;
  nodeVersion: string;
  os: string;
  workers: number;
  retries: number;
  projects: string[];
}

export interface GlobalError {
  message: string;
  stack?: string;
}

export type TestStatus = "passed" | "failed" | "timedOut" | "skipped" | "interrupted";

export interface TestErrorLocation {
  file: string;
  line: number;
  column: number;
}

export interface TestError {
  message: string;
  stack?: string;
  snippet?: string;
  diff?: { expected: string; actual: string };
  location?: TestErrorLocation;
}

export interface TestAttachment {
  name: string;
  contentType: string;
  path?: string;
}

export interface LlmTestEntry {
  id: string;
  title: string;
  status: TestStatus;
  flaky: boolean;
  durationMs: number;
  location: TestErrorLocation;
  project: string;
  tags: string[];
  annotations: Array<{ type: string; description?: string }>;
  retries: number;
  errors: TestError[];
  attachments: TestAttachment[];
  stdout: string;
  stderr: string;
}

export interface LlmTestReport {
  schemaVersion: 1;
  timestamp: string;
  durationMs: number;
  summary: TestSummary;
  environment: TestEnvironment;
  tests: LlmTestEntry[];
  globalErrors: GlobalError[];
}
