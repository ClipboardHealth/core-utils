export const STDOUT_CAP = 4096;
export const NETWORK_BODY_CAP = 2048;
export const CONSOLE_TEXT_CAP = 2048;
export const CONSOLE_MESSAGES_CAP = 50;
export const INSTANCES_CAP = 500;
export const GROUPS_CAP = 200;
export const BODIES_CAP = 100;
export const DUPLICATE_SAMPLE_THRESHOLD = 3;
export const DUPLICATE_SAMPLE_STRIDE = 10;
export const HEADER_VALUE_CAP = 256;
export const TRUNCATION_MARKER = "[truncated]";
export const SCREENSHOT_BASE64_CAP = 524_288;

export const ABORTED_FAILURE_PATTERN = /^net::ERR_ABORTED\b/i;

export const REQUEST_HEADER_ALLOWLIST = new Set([
  "content-type",
  "x-request-id",
  "x-correlation-id",
  "traceparent",
  "tracestate",
]);

export const RESPONSE_HEADER_ALLOWLIST = new Set([
  "content-type",
  "location",
  "x-request-id",
  "x-correlation-id",
  "traceparent",
  "tracestate",
]);

export const HIGH_SIGNAL_CONSOLE_ENTRY_TYPES = new Set(["warning", "error", "pageerror"]);
export const LOW_SIGNAL_RESOURCE_TYPES = new Set([
  "script",
  "stylesheet",
  "image",
  "font",
  "media",
]);
