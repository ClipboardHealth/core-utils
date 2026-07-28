import { stripAnsi } from "./textProcessing";
import { asNumber, asString } from "./typeGuards";

export const CLIENT_LIFECYCLE_CLASSIFICATION_PRIORITY = [
  "no_response_headers",
  "headers_without_body_completion",
  "network_failure",
  "completed",
] as const;
export type BrowserLifecycleClassification =
  (typeof CLIENT_LIFECYCLE_CLASSIFICATION_PRIORITY)[number];

const CLIENT_LIFECYCLE_PATH_CAP = 512;
const CLIENT_LIFECYCLE_IDENTIFIER_CAP = 256;
const CLIENT_LIFECYCLE_CLASSIFICATIONS = new Set<string>(CLIENT_LIFECYCLE_CLASSIFICATION_PRIORITY);
const SAFE_IDENTIFIER_PATTERN = /^[A-Za-z0-9_:=./+-]+$/;
const SAFE_PROTOCOL_PATTERN = /^[A-Za-z0-9./_-]+$/;
const SAFE_NETWORK_ERROR_PATTERN = /^net::[A-Z0-9_]+$/;
const SAFE_IP_ADDRESS_PATTERN = /^[A-Fa-f0-9:.]+$/;

export function sanitizeLifecycleMethod(value: unknown): string | undefined {
  const method = asString(value)?.trim().toUpperCase();
  if (!method || method.length > 16 || !/^[A-Z]+$/.test(method)) {
    return undefined;
  }
  return method;
}

export function sanitizeLifecycleOrigin(value: unknown): string | undefined {
  const originText = asString(value);
  if (!originText || originText.length > CLIENT_LIFECYCLE_IDENTIFIER_CAP) {
    return undefined;
  }
  try {
    const url = new URL(originText);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return undefined;
    }
    return url.origin;
  } catch {
    return undefined;
  }
}

export function sanitizeLifecyclePathTemplate(value: unknown): string | undefined {
  const pathText = asString(value);
  if (!pathText) {
    return undefined;
  }
  const [withoutQuery] = pathText.split(/[?#]/, 1);
  if (
    !withoutQuery ||
    !withoutQuery.startsWith("/") ||
    withoutQuery.length > CLIENT_LIFECYCLE_PATH_CAP
  ) {
    return undefined;
  }
  return withoutQuery;
}

export function sanitizeLifecycleClassification(
  value: unknown,
): BrowserLifecycleClassification | undefined {
  const classification = asString(value);
  if (classification && CLIENT_LIFECYCLE_CLASSIFICATIONS.has(classification)) {
    return classification as BrowserLifecycleClassification;
  }
  return undefined;
}

export function sanitizeLifecycleIdentifier(value: unknown): string | undefined {
  const identifier = asString(value);
  if (
    identifier &&
    identifier.length <= CLIENT_LIFECYCLE_IDENTIFIER_CAP &&
    SAFE_IDENTIFIER_PATTERN.test(identifier)
  ) {
    return identifier;
  }
  return undefined;
}

export function sanitizeLifecycleProtocol(value: unknown): string | undefined {
  const protocol = asString(value);
  if (
    protocol &&
    protocol.length <= CLIENT_LIFECYCLE_IDENTIFIER_CAP &&
    SAFE_PROTOCOL_PATTERN.test(protocol)
  ) {
    return protocol;
  }
  return undefined;
}

export function sanitizeLifecycleNetworkError(value: unknown): string | undefined {
  const errorText = asString(value);
  if (!errorText) {
    return undefined;
  }
  const sanitizedErrorText = stripAnsi(errorText).trim();
  return SAFE_NETWORK_ERROR_PATTERN.test(sanitizedErrorText) ? sanitizedErrorText : undefined;
}

export function sanitizeLifecycleIpAddress(value: unknown): string | undefined {
  const ipAddress = asString(value);
  if (
    ipAddress &&
    ipAddress.length <= CLIENT_LIFECYCLE_IDENTIFIER_CAP &&
    SAFE_IP_ADDRESS_PATTERN.test(ipAddress)
  ) {
    return ipAddress;
  }
  return undefined;
}

export function sanitizeLifecycleTraceId(value: unknown): string | undefined {
  return sanitizeLifecycleHexIdentifier({ value, length: 32 });
}

export function sanitizeLifecycleSpanId(value: unknown): string | undefined {
  return sanitizeLifecycleHexIdentifier({ value, length: 16 });
}

export function sanitizeLifecycleNonNegativeNumber(value: unknown): number | undefined {
  const number = asNumber(value);
  if (number === undefined || number < 0 || number > Number.MAX_SAFE_INTEGER) {
    return undefined;
  }
  return number;
}

function sanitizeLifecycleHexIdentifier({
  value,
  length,
}: {
  value: unknown;
  length: number;
}): string | undefined {
  const identifier = asString(value)?.toLowerCase();
  if (
    identifier &&
    identifier.length === length &&
    /^[a-f0-9]+$/.test(identifier) &&
    !/^0+$/.test(identifier)
  ) {
    return identifier;
  }
  return undefined;
}
