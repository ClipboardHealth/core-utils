/**
 * Recursively freezes an object and all its nested properties.
 *
 * @template T - Type of the object to freeze
 * @param value - The object to freeze
 * @param seen - Internal parameter to track circular references
 * @returns A deeply frozen version of the input object.
 */
// eslint-disable-next-line
export function deepFreeze<T extends object>(value: T, seen = new WeakSet()): Readonly<T> {
  if (!value || typeof value !== "object" || seen.has(value)) {
    return value;
  }

  seen.add(value);
  (Reflect.ownKeys(value) as Array<keyof T>).forEach((key) => {
    const property = value[key];
    if (property && typeof property === "object" && !Object.isFrozen(property)) {
      // eslint-disable-next-line
      deepFreeze<object & typeof property>(property, seen);
    }
  });

  return Object.freeze(value);
}
