import type { ConsoleEntry } from "../types";
import {
  CONSOLE_MESSAGES_CAP,
  HIGH_SIGNAL_CONSOLE_ENTRY_TYPES,
  LOW_SIGNAL_RESOURCE_TYPES,
} from "./constants";

interface StaticAssetShape {
  status: number;
  resourceType?: string;
  failureText?: string;
  wasAborted?: boolean;
}

function isHighSignalConsoleEntry(entry: ConsoleEntry): boolean {
  return HIGH_SIGNAL_CONSOLE_ENTRY_TYPES.has(entry.type);
}

export function canImproveConsoleSignal(consoleMessages: ConsoleEntry[]): boolean {
  if (consoleMessages.length < CONSOLE_MESSAGES_CAP) {
    return true;
  }
  return consoleMessages.some((entry) => !isHighSignalConsoleEntry(entry));
}

export function appendConsoleEntryWithPriority(
  consoleMessages: ConsoleEntry[],
  consoleEntry: ConsoleEntry,
): void {
  if (consoleMessages.length < CONSOLE_MESSAGES_CAP) {
    consoleMessages.push(consoleEntry);
    return;
  }

  if (!isHighSignalConsoleEntry(consoleEntry)) {
    return;
  }

  const firstLowSignalIndex = consoleMessages.findIndex(
    (entry) => !isHighSignalConsoleEntry(entry),
  );
  if (firstLowSignalIndex === -1) {
    return;
  }

  consoleMessages.splice(firstLowSignalIndex, 1);
  consoleMessages.push(consoleEntry);
}

export function isLowSignalStaticAsset(shape: StaticAssetShape): boolean {
  return (
    shape.resourceType !== undefined &&
    LOW_SIGNAL_RESOURCE_TYPES.has(shape.resourceType) &&
    shape.status < 400 &&
    shape.failureText === undefined &&
    shape.wasAborted !== true
  );
}
