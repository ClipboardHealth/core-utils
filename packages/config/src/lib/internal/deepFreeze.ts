// eslint-disable-next-line @typescript-eslint/ban-types
export function deepFreeze<T extends object>(value: T, seen = new WeakSet()): Readonly<T> {
  if (!value || typeof value !== "object" || seen.has(value)) {
    return value;
  }

  seen.add(value);
  (Reflect.ownKeys(value) as Array<keyof T>).forEach((key) => {
    const property = value[key];
    if (property && typeof property === "object" && !Object.isFrozen(property)) {
      // eslint-disable-next-line @typescript-eslint/ban-types
      deepFreeze(property as object, seen);
    }
  });

  // The actual return type is ReadonlyDeep<T>, but they're difficult to work with in TypeScript.
  return Object.freeze(value);
}
