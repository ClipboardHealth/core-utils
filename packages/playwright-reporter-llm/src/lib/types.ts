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

export interface TestLocation {
  file: string;
  line: number;
  column: number;
}

export interface TestError {
  message: string;
  stack?: string;
  snippet?: string;
  diff?: { expected: string; actual: string };
  location?: TestLocation;
}

export interface TestAttachment {
  name: string;
  contentType: string;
  path?: string;
}

export interface FlatStep {
  title: string;
  category: string;
  durationMs: number;
  depth: number;
  error?: string;
}

export interface NetworkRequest {
  method: string;
  url: string;
  status: number;
  durationMs?: number;
  resourceType?: string;
  requestBody?: string;
  responseBody?: string;
}

export interface ConsoleEntry {
  type: string;
  text: string;
}

export interface AttemptResult {
  attempt: number;
  status: TestStatus;
  durationMs: number;
  startTime: string;
  workerIndex: number;
  parallelIndex: number;
  error?: TestError;
  steps: FlatStep[];
  stdout: string;
  stderr: string;
  attachments: TestAttachment[];
  network: NetworkRequest[];
  consoleMessages?: ConsoleEntry[];
}

export interface LlmTestEntry {
  id: string;
  title: string;
  status: TestStatus;
  flaky: boolean;
  durationMs: number;
  location: TestLocation;
  project: string;
  tags: string[];
  annotations: Array<{ type: string; description?: string }>;
  retries: number;
  errors: TestError[];
  attachments: TestAttachment[];
  stdout: string;
  stderr: string;
  attempts: AttemptResult[];
  error?: TestError;
  steps?: FlatStep[];
  network?: NetworkRequest[];
}

export interface LlmReporterOptions {
  outputFile?: string;
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
