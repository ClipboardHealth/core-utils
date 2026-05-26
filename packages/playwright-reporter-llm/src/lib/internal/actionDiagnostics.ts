import { ACTION_LOG_MESSAGE_CAP, ACTION_LOG_MESSAGES_CAP, ACTION_SELECTOR_CAP } from "./constants";
import { capText, stripAnsi } from "./textProcessing";
import { asNumber, asRecord, asString } from "./typeGuards";

export interface ActionRecord {
  callId: string;
  log: string[];
  apiName?: string;
  selector?: string;
  error?: string;
  startTime?: number;
  endTime?: number;
}

export class ActionBuilder {
  private readonly recordsByCallId = new Map<string, ActionRecord>();
  private readonly orderedCallIds: string[] = [];

  public admit(eventRecord: Record<string, unknown>): void {
    const eventType = asString(eventRecord["type"]);

    if (eventType === "before" || eventType === "action") {
      this.admitStartEvent(eventRecord);
      return;
    }

    if (eventType === "log") {
      this.admitLogEvent(eventRecord);
      return;
    }

    if (eventType === "after") {
      this.admitAfterEvent(eventRecord);
    }
  }

  public findFailingAction(): ActionRecord | undefined {
    const failedRecord = this.findLastRecord((record) => record.error !== undefined);
    if (failedRecord) {
      return cloneRecord(failedRecord);
    }

    const completedRecord = this.findLastRecord((record) => record.endTime !== undefined);
    if (completedRecord) {
      return cloneRecord(completedRecord);
    }

    return undefined;
  }

  private admitStartEvent(eventRecord: Record<string, unknown>): void {
    const callId = asString(eventRecord["callId"]);
    if (!callId) {
      return;
    }

    const record = this.getOrCreateRecord(callId);
    const apiName = extractApiName(eventRecord);
    if (apiName !== undefined) {
      record.apiName = apiName;
    }

    const selector = extractSelector(eventRecord);
    if (selector !== undefined) {
      record.selector = selector;
    }

    const startTime = asNumber(eventRecord["startTime"]);
    if (startTime !== undefined) {
      record.startTime = startTime;
    }

    for (const logMessage of extractLogMessages(eventRecord["log"])) {
      record.log.push(capActionLogMessage(logMessage));
    }
  }

  private admitLogEvent(eventRecord: Record<string, unknown>): void {
    const callId = asString(eventRecord["callId"]);
    const message = asString(eventRecord["message"]);
    if (!callId || message === undefined) {
      return;
    }

    const record = this.getOrCreateRecord(callId);
    record.log.push(capActionLogMessage(message));
  }

  private admitAfterEvent(eventRecord: Record<string, unknown>): void {
    const callId = asString(eventRecord["callId"]);
    if (!callId) {
      return;
    }

    const record = this.getOrCreateRecord(callId);
    const error = extractErrorText(eventRecord["error"]);
    if (error !== undefined) {
      record.error = error;
    }

    const endTime = asNumber(eventRecord["endTime"]);
    if (endTime !== undefined) {
      record.endTime = endTime;
    }
  }

  private getOrCreateRecord(callId: string): ActionRecord {
    const existingRecord = this.recordsByCallId.get(callId);
    if (existingRecord) {
      return existingRecord;
    }

    const record: ActionRecord = { callId, log: [] };
    this.recordsByCallId.set(callId, record);
    this.orderedCallIds.push(callId);
    return record;
  }

  private findLastRecord(predicate: (record: ActionRecord) => boolean): ActionRecord | undefined {
    for (let index = this.orderedCallIds.length - 1; index >= 0; index -= 1) {
      const callId = this.orderedCallIds[index];
      if (callId === undefined) {
        continue;
      }

      const record = this.recordsByCallId.get(callId);
      if (record && predicate(record)) {
        return record;
      }
    }

    return undefined;
  }
}

function extractApiName(eventRecord: Record<string, unknown>): string | undefined {
  const explicitApiName = asString(eventRecord["apiName"]);
  if (explicitApiName) {
    return explicitApiName;
  }

  const className = asString(eventRecord["class"]);
  const methodName = asString(eventRecord["method"]);
  if (className && methodName) {
    return `${className}.${methodName}`;
  }

  return asString(eventRecord["title"]);
}

function extractSelector(eventRecord: Record<string, unknown>): string | undefined {
  const paramsRecord = asRecord(eventRecord["params"]);
  const selector =
    asString(paramsRecord?.["selector"]) ??
    asString(paramsRecord?.["source"]) ??
    asString(paramsRecord?.["target"]) ??
    asString(eventRecord["selector"]);

  if (!selector) {
    return undefined;
  }

  return capText(stripAnsi(selector), ACTION_SELECTOR_CAP);
}

function extractLogMessages(logValue: unknown): string[] {
  if (!Array.isArray(logValue)) {
    return [];
  }

  const logMessages: string[] = [];
  for (const item of logValue) {
    const message = asString(item);
    if (message !== undefined) {
      logMessages.push(message);
    }
  }
  return logMessages;
}

function extractErrorText(errorValue: unknown): string | undefined {
  const errorText = asString(errorValue);
  if (errorText) {
    return capActionLogMessage(errorText);
  }

  const errorRecord = asRecord(errorValue);
  const message = asString(errorRecord?.["message"]);
  if (message) {
    return capActionLogMessage(message);
  }

  const nestedErrorRecord = asRecord(errorRecord?.["error"]);
  const nestedMessage = asString(nestedErrorRecord?.["message"]);
  if (nestedMessage) {
    return capActionLogMessage(nestedMessage);
  }

  return undefined;
}

function capActionLogMessage(message: string): string {
  return capText(stripAnsi(message), ACTION_LOG_MESSAGE_CAP);
}

function compactActionLog(logMessages: string[]): string[] {
  if (logMessages.length <= ACTION_LOG_MESSAGES_CAP) {
    return [...logMessages];
  }

  const headCount = 5;
  const tailCount = ACTION_LOG_MESSAGES_CAP - headCount - 1;
  const omittedCount = logMessages.length - headCount - tailCount;

  return [
    ...logMessages.slice(0, headCount),
    `[${omittedCount} action log messages omitted]`,
    ...logMessages.slice(logMessages.length - tailCount),
  ];
}

function cloneRecord(record: ActionRecord): ActionRecord {
  const clonedRecord: ActionRecord = {
    callId: record.callId,
    log: compactActionLog(record.log),
  };

  if (record.apiName !== undefined) {
    clonedRecord.apiName = record.apiName;
  }
  if (record.selector !== undefined) {
    clonedRecord.selector = record.selector;
  }
  if (record.error !== undefined) {
    clonedRecord.error = record.error;
  }
  if (record.startTime !== undefined) {
    clonedRecord.startTime = record.startTime;
  }
  if (record.endTime !== undefined) {
    clonedRecord.endTime = record.endTime;
  }

  return clonedRecord;
}
