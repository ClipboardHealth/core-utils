export function deepFreeze<T extends Record<string, unknown>>(value: T): Readonly<T> {
  Object.keys(value).forEach((key) => {
    const v = value[key as keyof T];
    if (v && typeof v === "object" && !Object.isFrozen(v)) {
      deepFreeze(v as Record<string, unknown>);
    }
  });

  // The actual return type is ReadonlyDeep<T>, but they're difficult to work with in TypeScript.
  return Object.freeze(value);
}
