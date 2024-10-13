export function splitString(value: unknown) {
  return typeof value === "string" ? value.split(",") : value;
}
