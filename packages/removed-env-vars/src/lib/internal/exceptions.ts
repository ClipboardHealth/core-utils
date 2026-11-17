import { isRecord } from "@clipboard-health/util-ts";

export interface RemovalException {
  name: string;
  reason: string;
  ticket: string;
  expiresOn: string;
}

export interface ParsedExceptions {
  exceptions: RemovalException[];
  errors: string[];
}

const REQUIRED_FIELDS = ["name", "reason", "ticket", "expiresOn"] as const;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Parses the exceptions file: a JSON array of `{ name, reason, ticket, expiresOn }`, where
 * `expiresOn` is a `YYYY-MM-DD` date. Every field is required so each exception names why it is
 * safe, where that's tracked and when it stops applying.
 */
export function parseExceptions(params: { filePath: string; source: string }): ParsedExceptions {
  const { filePath, source } = params;
  let json: unknown;
  try {
    json = JSON.parse(source);
  } catch (error) {
    return { exceptions: [], errors: [`${filePath}: invalid JSON: ${String(error)}`] };
  }

  if (!Array.isArray(json)) {
    return { exceptions: [], errors: [`${filePath}: expected a JSON array of exceptions`] };
  }

  const exceptions: RemovalException[] = [];
  const errors: string[] = [];
  for (const [index, entry] of json.entries()) {
    const location = `${filePath}[${index}]`;
    if (!isRecord(entry)) {
      errors.push(`${location}: expected an object`);
      continue;
    }

    const { name, reason, ticket, expiresOn } = entry;
    if (
      !isNonEmptyString(name) ||
      !isNonEmptyString(reason) ||
      !isNonEmptyString(ticket) ||
      !isNonEmptyString(expiresOn)
    ) {
      const missing = REQUIRED_FIELDS.filter((field) => !isNonEmptyString(entry[field]));
      errors.push(`${location}: missing or empty ${missing.join(", ")}`);
      continue;
    }

    const exception: RemovalException = { name, reason, ticket, expiresOn };
    if (!isValidDate(exception.expiresOn)) {
      errors.push(`${location}: expiresOn must be a YYYY-MM-DD date`);
      continue;
    }

    exceptions.push(exception);
  }

  return { exceptions, errors };
}

/** Whether `expiresOn` is before `today`; both are `YYYY-MM-DD`, so string order is date order. */
export function isExpired(params: { expiresOn: string; today: string }): boolean {
  return params.expiresOn < params.today;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "";
}

function isValidDate(value: string): boolean {
  if (!DATE_PATTERN.test(value)) {
    return false;
  }

  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
}
