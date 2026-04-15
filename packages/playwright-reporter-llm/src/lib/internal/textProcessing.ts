import { CONSOLE_TEXT_CAP, NETWORK_BODY_CAP, STDOUT_CAP, TRUNCATION_MARKER } from "./constants";

export function stripAnsi(text: string): string {
  // eslint-disable-next-line no-control-regex
  return text.replaceAll(/\u001B\[[0-9;]*m/g, "");
}

export function capText(value: string, limit: number): string {
  if (value.length <= limit) {
    return value;
  }
  return `${value.slice(0, limit - TRUNCATION_MARKER.length)}${TRUNCATION_MARKER}`;
}

export function capOutput(text: string): string {
  if (text.length <= STDOUT_CAP) {
    return text;
  }
  return `${text.slice(0, STDOUT_CAP - TRUNCATION_MARKER.length)}${TRUNCATION_MARKER}`;
}

export function capNetworkBody(body: string): string {
  return capText(body, NETWORK_BODY_CAP);
}

export function capConsoleMessageText(text: string): string {
  return capText(text, CONSOLE_TEXT_CAP);
}

export function isJsonOrTextContentType(contentType: string | undefined): boolean {
  if (!contentType) {
    return false;
  }

  const normalizedContentType = contentType.split(";")[0]?.trim().toLowerCase();
  if (!normalizedContentType) {
    return false;
  }

  return normalizedContentType.startsWith("text/") || normalizedContentType.includes("json");
}

export function extractFirstLine(text: string | undefined): string | undefined {
  if (!text) {
    return undefined;
  }

  const firstLine = stripAnsi(text).split("\n")[0]?.trim();
  if (!firstLine) {
    return undefined;
  }

  return firstLine;
}
