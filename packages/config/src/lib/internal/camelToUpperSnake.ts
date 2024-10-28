export function camelToUpperSnake(value: readonly string[]): string {
  return value
    .join("_")
    .replaceAll(/([a-z])([A-Z])/g, "$1_$2")
    .toUpperCase();
}
