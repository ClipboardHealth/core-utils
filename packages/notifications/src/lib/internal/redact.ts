export function redact(params: {
  data: Record<string, unknown> | undefined;
  keysToRedact: string[];
}): Record<string, unknown> | undefined {
  const { data, keysToRedact } = params;

  if (!data) {
    return data;
  }

  const redactedObject: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    redactedObject[key] = redactValue({ keysToRedact, key, value });
  }

  return redactedObject;
}

function redactValue(params: { keysToRedact: string[]; key?: string; value: unknown }): unknown {
  const { value, key, keysToRedact } = params;

  if (key && keysToRedact.includes(key)) {
    return "[REDACTED]";
  }

  if (value === null || value === undefined) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((aValue) => redactValue({ keysToRedact, value: aValue }));
  }

  if (isPlainObject(value)) {
    const redactedObject: Record<string, unknown> = {};
    for (const [oKey, oValue] of Object.entries(value)) {
      redactedObject[oKey] = redactValue({ keysToRedact, key: oKey, value: oValue });
    }

    return redactedObject;
  }

  return value;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Object.prototype.toString.call(value) === "[object Object]";
}
