export function deepFreeze<T extends Record<string, unknown>>(
  value: T,
  seen = new WeakSet(),
): Readonly<T> {
  if (!value || typeof value !== "object" || seen.has(value)) {
    return value;
  }

  seen.add(value);
  Object.values(value).forEach((property) => {
    if (property && typeof property === "object" && !Object.isFrozen(property)) {
      deepFreeze(property as Record<string, unknown>, seen);
    }
  });

  // The actual return type is ReadonlyDeep<T>, but they're difficult to work with in TypeScript.
  return Object.freeze(value);
}
