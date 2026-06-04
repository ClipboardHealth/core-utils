import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import type { ModelRole, ModelSpec } from "./models.ts";
import type {
  CallMetadata,
  TribunalProgressEvent,
  TribunalProgressHandler,
  TribunalProgressStatus,
  TribunalRequest,
  TribunalResponse,
} from "./tribunal.ts";

export type IntermediateOutputRunStatus = "running" | "completed" | "failed";

export interface IntermediateOutputEvent {
  at: string;
  role: ModelRole;
  status: TribunalProgressStatus;
  model: ModelSpec;
  latencyMs?: number;
  errorMessage?: string;
}

export interface IntermediateOutputCall {
  role: ModelRole;
  status: TribunalProgressStatus;
  model: ModelSpec;
  startedAt?: string;
  completedAt?: string;
  failedAt?: string;
  latencyMs?: number;
  metadata?: CallMetadata;
  output?: unknown;
  errorMessage?: string;
}

export interface IntermediateOutputSnapshot {
  version: 1;
  status: IntermediateOutputRunStatus;
  request: TribunalRequest;
  startedAt: string;
  updatedAt: string;
  events: IntermediateOutputEvent[];
  calls: Partial<Record<ModelRole, IntermediateOutputCall>>;
  response?: TribunalResponse;
  errorMessage?: string;
}

export interface IntermediateOutputRecorder {
  filePath: string;
  onProgress: TribunalProgressHandler;
  markCompleted: (response: TribunalResponse) => Promise<void>;
  markFailed: (error: unknown) => Promise<void>;
}

export interface CreateIntermediateOutputRecorderInput {
  filePath: string;
  request: TribunalRequest;
  now?: () => Date;
  makeDirectory?: (path: string) => Promise<void>;
  writeFile?: (path: string, contents: string) => Promise<void>;
}

const INTERMEDIATE_OUTPUT_DIRECTORY = ".tribunal/runs";

export function createDefaultIntermediateOutputPath(input: {
  cwd: string;
  now?: () => Date;
}): string {
  const { cwd, now = createDate } = input;
  const timestamp = formatPathTimestamp(now());

  return path.resolve(cwd, INTERMEDIATE_OUTPUT_DIRECTORY, `${timestamp}.json`);
}

export async function createIntermediateOutputRecorder(
  input: CreateIntermediateOutputRecorderInput,
): Promise<IntermediateOutputRecorder> {
  const {
    filePath,
    makeDirectory = makeDirectoryOnDisk,
    now = createDate,
    request,
    writeFile: writeFileToDisk = writeFileOnDisk,
  } = input;
  const startedAt = formatTimestamp(now());
  const snapshot: IntermediateOutputSnapshot = {
    calls: {},
    events: [],
    request,
    startedAt,
    status: "running",
    updatedAt: startedAt,
    version: 1,
  };
  let writeQueue = Promise.resolve();

  await makeDirectory(path.dirname(filePath));
  await persist(startedAt);

  async function onProgress(event: TribunalProgressEvent): Promise<void> {
    const timestamp = formatTimestamp(now());
    snapshot.events.push(createEventRecord({ event, timestamp }));
    snapshot.calls[event.role] = createCallRecord({
      event,
      existingCall: snapshot.calls[event.role],
      timestamp,
    });

    await persist(timestamp);
  }

  async function markCompleted(response: TribunalResponse): Promise<void> {
    const timestamp = formatTimestamp(now());

    snapshot.status = "completed";
    snapshot.response = response;

    await persist(timestamp);
  }

  async function markFailed(error: unknown): Promise<void> {
    const timestamp = formatTimestamp(now());

    snapshot.status = "failed";
    snapshot.errorMessage = formatErrorMessage(error);

    await persist(timestamp);
  }

  async function persist(timestamp: string): Promise<void> {
    snapshot.updatedAt = timestamp;
    const contents = `${JSON.stringify(snapshot, undefined, 2)}\n`;

    writeQueue = writeQueuedSnapshot({
      contents,
      filePath,
      previousWrite: writeQueue,
      writeFile: writeFileToDisk,
    });

    await writeQueue;
  }

  return { filePath, markCompleted, markFailed, onProgress };
}

async function writeQueuedSnapshot(input: {
  previousWrite: Promise<void>;
  filePath: string;
  contents: string;
  writeFile: (path: string, contents: string) => Promise<void>;
}): Promise<void> {
  const { contents, filePath, previousWrite, writeFile: writeSnapshot } = input;

  try {
    await previousWrite;
  } catch {
    // Keep later snapshots possible after a transient write failure.
  }

  await writeSnapshot(filePath, contents);
}

function createEventRecord(input: {
  event: TribunalProgressEvent;
  timestamp: string;
}): IntermediateOutputEvent {
  const { event, timestamp } = input;
  const record: IntermediateOutputEvent = {
    at: timestamp,
    model: event.model,
    role: event.role,
    status: event.status,
  };

  if (event.latencyMs !== undefined) {
    record.latencyMs = event.latencyMs;
  }

  if (event.errorMessage !== undefined) {
    record.errorMessage = event.errorMessage;
  }

  return record;
}

function createCallRecord(input: {
  event: TribunalProgressEvent;
  existingCall: IntermediateOutputCall | undefined;
  timestamp: string;
}): IntermediateOutputCall {
  const { event, existingCall, timestamp } = input;
  const record: IntermediateOutputCall = {
    ...existingCall,
    model: event.model,
    role: event.role,
    status: event.status,
  };

  if (event.status === "started") {
    record.startedAt = timestamp;
    return record;
  }

  if (event.status === "completed") {
    record.completedAt = timestamp;
    assignCompletedCallFields(record, event);
    return record;
  }

  record.failedAt = timestamp;

  if (event.errorMessage !== undefined) {
    record.errorMessage = event.errorMessage;
  }

  return record;
}

function assignCompletedCallFields(
  record: IntermediateOutputCall,
  event: TribunalProgressEvent,
): void {
  if (event.latencyMs !== undefined) {
    record.latencyMs = event.latencyMs;
  }

  if (event.metadata !== undefined) {
    record.metadata = event.metadata;
  }

  if (event.output !== undefined) {
    record.output = event.output;
  }
}

async function makeDirectoryOnDisk(path: string): Promise<void> {
  await mkdir(path, { recursive: true });
}

async function writeFileOnDisk(path: string, contents: string): Promise<void> {
  await writeFile(path, contents, "utf8");
}

function createDate(): Date {
  return new Date();
}

function formatPathTimestamp(date: Date): string {
  return date.toISOString().replaceAll(":", "-").replaceAll(".", "-");
}

function formatTimestamp(date: Date): string {
  return date.toISOString();
}

function formatErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
