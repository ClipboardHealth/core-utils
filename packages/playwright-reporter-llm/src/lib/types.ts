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
  offsetMs: number;
  error?: string;
}

export interface NetworkTimingBreakdown {
  sendMs?: number;
  waitMs?: number;
  receiveMs?: number;
  dnsMs?: number;
  connectMs?: number;
  sslMs?: number;
}

export interface NetworkRedirectHop {
  url: string;
  status: number;
}

export interface NetworkRequest {
  method: string;
  url: string;
  status: number;
  durationMs?: number;
  resourceType?: string;
  offsetMs?: number;
  traceId?: string;
  requestBody?: string;
  responseBody?: string;
  failureText?: string;
  wasAborted?: boolean;
  redirectFromUrl?: string;
  redirectToUrl?: string;
  redirectChain?: NetworkRedirectHop[];
  timings?: NetworkTimingBreakdown;
  requestHeaders?: Record<string, string>;
  responseHeaders?: Record<string, string>;
}

export interface FailureArtifacts {
  screenshotBase64?: string;
  videoPath?: string;
}

export interface ConsoleEntry {
  type: string;
  text: string;
  offsetMs?: number;
}

export interface TimelineStepEntry {
  kind: "step";
  offsetMs: number;
  title: string;
  category: string;
  durationMs: number;
  depth: number;
  error?: string;
}

export interface TimelineNetworkEntry {
  kind: "network";
  offsetMs: number;
  method: string;
  url: string;
  status: number;
  durationMs?: number;
  resourceType?: string;
  traceId?: string;
  failureText?: string;
  wasAborted?: boolean;
}

export interface TimelineConsoleEntry {
  kind: "console";
  offsetMs: number;
  type: string;
  text: string;
}

export type TimelineEntry = TimelineStepEntry | TimelineNetworkEntry | TimelineConsoleEntry;

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
  consoleMessages: ConsoleEntry[];
  timeline: TimelineEntry[];
  failureArtifacts?: FailureArtifacts;
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
  timeline?: TimelineEntry[];
}

export interface LlmReporterOptions {
  outputFile?: string;
}

export interface LlmTestReport {
  schemaVersion: 2;
  timestamp: string;
  durationMs: number;
  summary: TestSummary;
  environment: TestEnvironment;
  tests: LlmTestEntry[];
  globalErrors: GlobalError[];
}
