import type { ConsoleEntry, NetworkRequest } from "../types";
import {
  CONSOLE_MESSAGES_CAP,
  HIGH_SIGNAL_CONSOLE_ENTRY_TYPES,
  HIGH_SIGNAL_RESOURCE_TYPES,
  LOW_SIGNAL_RESOURCE_TYPES,
  NETWORK_REQUESTS_CAP,
} from "./constants";

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

function isHighSignalNetworkRequest(request: NetworkRequest): boolean {
  return (
    (request.resourceType !== undefined && HIGH_SIGNAL_RESOURCE_TYPES.has(request.resourceType)) ||
    request.status >= 400 ||
    request.failureText !== undefined ||
    request.wasAborted === true
  );
}

function isLowSignalStaticAsset(request: NetworkRequest): boolean {
  return (
    request.resourceType !== undefined &&
    LOW_SIGNAL_RESOURCE_TYPES.has(request.resourceType) &&
    request.status < 400 &&
    request.failureText === undefined &&
    request.wasAborted !== true
  );
}

export function canImproveNetworkSignal(networkRequests: NetworkRequest[]): boolean {
  if (networkRequests.length < NETWORK_REQUESTS_CAP) {
    return true;
  }
  return networkRequests.some((request) => !isHighSignalNetworkRequest(request));
}

export function appendNetworkRequestWithPriority(
  networkRequests: NetworkRequest[],
  networkRequest: NetworkRequest,
): void {
  if (isLowSignalStaticAsset(networkRequest)) {
    return;
  }

  if (networkRequests.length < NETWORK_REQUESTS_CAP) {
    networkRequests.push(networkRequest);
    return;
  }

  if (!isHighSignalNetworkRequest(networkRequest)) {
    return;
  }

  const firstLowSignalIndex = networkRequests.findIndex(
    (request) => !isHighSignalNetworkRequest(request),
  );
  if (firstLowSignalIndex === -1) {
    return;
  }

  networkRequests.splice(firstLowSignalIndex, 1);
  networkRequests.push(networkRequest);
}
