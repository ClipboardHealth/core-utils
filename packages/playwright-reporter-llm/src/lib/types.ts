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

export interface NetworkInstance {
  id: string;
  groupId: string;
  method: string;
  url: string;
  status: number;
  offsetMs?: number;
  durationMs?: number;
  timings?: NetworkTimingBreakdown;
  traceId?: string;
  spanId?: string;
  requestId?: string;
  correlationId?: string;
  requestBodyRef?: string;
  responseBodyRef?: string;
  redirectFromId?: string;
  redirectToId?: string;
}

export interface NetworkGroup {
  id: string;
  method: string;
  url: string;
  status: number;
  resourceType?: string;
  failureText?: string;
  wasAborted?: boolean;
  occurrenceCount: number;
  retainedInstanceCount: number;
  suppressedInstanceCount: number;
  evictedInstanceCount: number;
  firstOffsetMs?: number;
  lastOffsetMs?: number;
  fingerprint: string;
}

export interface NetworkBody {
  id: string;
  content: string;
  contentType?: string;
  truncated: boolean;
  canonicalized: boolean;
  fingerprint: string;
}

export interface NetworkSummary {
  observedInstances: number;
  retainedInstances: number;
  retainedGroups: number;
  retainedBodies: number;
  instancesDroppedByFilter: number;
  instancesDroppedByGroupCap: number;
  instancesDroppedByInstanceCap: number;
  instancesSuppressedAsDuplicate: number;
  instancesEvictedAfterAdmission: number;
  bodiesOmittedByBodyCap: number;
  bodiesTruncated: number;
  bodiesCanonicalized: number;
}

export interface NetworkReport {
  summary: NetworkSummary;
  instances: NetworkInstance[];
  groups: Record<string, NetworkGroup>;
  bodies: Record<string, NetworkBody>;
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
  networkId: string;
  method: string;
  url: string;
  status: number;
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
  network: NetworkReport;
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
  annotations: { type: string; description?: string }[];
  retries: number;
  errors: TestError[];
  attachments: TestAttachment[];
  stdout: string;
  stderr: string;
  attempts: AttemptResult[];
  error?: TestError;
  steps?: FlatStep[];
  network?: NetworkReport;
  timeline: TimelineEntry[];
}

export interface LlmReporterOptions {
  outputFile?: string;
}

export interface LlmTestReport {
  schemaVersion: 3;
  timestamp: string;
  durationMs: number;
  summary: TestSummary;
  environment: TestEnvironment;
  tests: LlmTestEntry[];
  globalErrors: GlobalError[];
}
