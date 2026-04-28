import { ABORTED_FAILURE_PATTERN, LOW_SIGNAL_RESOURCE_TYPES } from "./constants";

export interface PriorityShape {
  status: number;
  resourceType?: string;
  failureText?: string;
  wasAborted?: boolean;
}

export function isAbortFailureText(text?: string): boolean {
  if (text === undefined) {
    return false;
  }
  return ABORTED_FAILURE_PATTERN.test(text.trim());
}

export function priorityScore(shape: PriorityShape): number {
  if (shape.status >= 500) {
    return 10;
  }

  if (shape.failureText !== undefined && !isAbortFailureText(shape.failureText)) {
    return 9;
  }

  if (shape.status >= 400) {
    return 8;
  }

  if (shape.resourceType === "xhr" || shape.resourceType === "fetch") {
    return 6;
  }

  if (isAbortFailureText(shape.failureText) || shape.status === -1 || shape.wasAborted === true) {
    return 4;
  }

  if (shape.resourceType === undefined) {
    return 3;
  }

  if (LOW_SIGNAL_RESOURCE_TYPES.has(shape.resourceType)) {
    return 1;
  }

  return 2;
}
